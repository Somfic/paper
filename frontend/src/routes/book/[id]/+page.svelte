<script lang="ts">
	import { page } from "$app/state";
	import { Button, PopoverMenu, type PopoverMenuEntry } from "glow";
	import { api } from "$lib/api";
	import type { Book } from "$lib/schema";

	const id = $derived(Number(page.params.id));

	// ── reader themes ──────────────────────────────────────────────
	type ThemeName = "light" | "sepia" | "dark";
	const THEMES: Record<
		ThemeName,
		{
			scheme: string;
			bg: string;
			fg: string;
			dim: string;
			link: string;
			chrome: string;
			border: string;
			surface: string;
		}
	> = {
		light: {
			scheme: "light",
			bg: "#fbfaf7",
			fg: "#1c1b19",
			dim: "#6b6862",
			link: "#0b5cad",
			chrome: "#f1efea",
			border: "rgba(0,0,0,0.10)",
			surface: "#e7e5df",
		},
		sepia: {
			scheme: "light",
			bg: "#f4ecd8",
			fg: "#5b4636",
			dim: "#8a7a63",
			link: "#9b4d1f",
			chrome: "#ece0c4",
			border: "rgba(91,70,54,0.18)",
			surface: "#e2d5b4",
		},
		dark: {
			scheme: "dark",
			bg: "#16161a",
			fg: "#c9c7c2",
			dim: "#807e79",
			link: "#8ab4f8",
			chrome: "#1f1f25",
			border: "rgba(255,255,255,0.12)",
			surface: "#0d0d10",
		},
	};

	type Settings = {
		theme: ThemeName;
		fontSize: number; // percent
		lineHeight: number;
		justify: boolean;
		flow: "paginated" | "scrolled";
		singleColumn: boolean;
		shading: boolean;
	};
	const DEFAULTS: Settings = {
		theme: "sepia",
		fontSize: 100,
		lineHeight: 1.6,
		justify: true,
		flow: "paginated",
		singleColumn: false,
		shading: false,
	};

	const posKey = (bookId: number) => `paper.pos.${bookId}`;

	function loadSettings(): Settings {
		try {
			return {
				...DEFAULTS,
				...JSON.parse(localStorage.getItem("paper.reader") ?? "{}"),
			};
		} catch {
			return { ...DEFAULTS };
		}
	}

	let settings = $state<Settings>(loadSettings());
	const theme = $derived(THEMES[settings.theme]);

	let container: HTMLDivElement;
	let book = $state<Book | null>(null);
	let metaTitle = $state("");
	let metaAuthor = $state("");
	let error = $state<string | null>(null);
	let fraction = $state(0);
	let loc = $state<{ current: number; total: number } | null>(null);
	let chapterLabel = $state("");
	let chapterPageRaw = $state(0); // foliate's raw page index (0 = leading pad)
	let chapterPagesRaw = $state(0); // includes 1 leading + 1 trailing pad page
	let ready = $state(false);
	let view: any = null;

	// Content pages in the current chapter (strip foliate's pad pages), the
	// current 1-based page, and how many remain to the chapter's end.
	const chapterPages = $derived(Math.max(1, chapterPagesRaw - 2));
	const chapterPage = $derived(
		Math.min(chapterPages, Math.max(1, chapterPageRaw)),
	);
	const chapterLeft = $derived(Math.max(0, chapterPages - chapterPage));
	const showPageInfo = $derived(settings.flow === "paginated" && chapterPagesRaw > 2);

	const displayTitle = $derived(metaTitle || book?.title || "");

	// ── physical-book page stacks ──────────────────────────────────
	// foliate's `location` is its synthetic page count (~1 per 1500 chars). Use it
	// to size the read (left) vs. remaining (right) stacks; total thickness scales
	// with book length but is capped so a huge book stays sane.
	const showStacks = $derived(
		settings.shading &&
			settings.flow === "paginated" &&
			!!loc &&
			loc.total > 0,
	);
	const totalStackPx = $derived(
		loc
			? Math.min(64, Math.max(10, Math.round(Math.sqrt(loc.total) * 1.6)))
			: 0,
	);
	const readRatio = $derived(
		loc && loc.total > 0
			? Math.min(1, Math.max(0, loc.current / loc.total))
			: 0,
	);
	const leftStackPx = $derived(Math.round(totalStackPx * readRatio));
	const rightStackPx = $derived(Math.round(totalStackPx * (1 - readRatio)));

	// Reading width of the book sheet (foliate fills it). Two-page mode is wide
	// enough for two columns; single is a single comfortable measure.
	const bookWidthRem = $derived(settings.singleColumn ? 40 : 66);

	// Center "spine" gutter shadow — only in two-page paginated mode.
	const showSpine = $derived(
		settings.shading &&
			settings.flow === "paginated" &&
			!settings.singleColumn,
	);

	// ── metadata helpers (foliate values can be string | object | array) ──
	function pickText(v: any): string {
		if (!v) return "";
		if (typeof v === "string") return v;
		if (Array.isArray(v)) return pickText(v[0]);
		if (typeof v === "object")
			return v.en ?? (Object.values(v)[0] as string) ?? "";
		return String(v);
	}
	function authorName(a: any): string {
		if (!a) return "";
		const x = Array.isArray(a) ? a[0] : a;
		if (typeof x === "string") return x;
		return pickText(x?.name ?? x);
	}

	// ── content stylesheet injected into the book itself ──
	function contentCSS(s: Settings): string {
		const t = THEMES[s.theme];
		return `
			html {
				color-scheme: ${t.scheme};
				color: ${t.fg} !important;
				background: ${t.bg} !important;
				font-size: ${s.fontSize}% !important;
			}
			body { background-color: ${t.bg} !important; color: ${t.fg} !important; }
			p, li, blockquote, dd, div, span { color: inherit; }
			p, li, blockquote, dd {
				line-height: ${s.lineHeight} !important;
				text-align: ${s.justify ? "justify" : "start"} !important;
				-webkit-hyphens: ${s.justify ? "auto" : "manual"};
				hyphens: ${s.justify ? "auto" : "manual"};
			}
			a, a:link, a:visited { color: ${t.link} !important; }
			img, image, svg, image > img { border-radius: 8px; }
		`;
	}

	const PAGE_MARGIN = 48; // foliate's default; used only to size columns

	// foliate measures the page height at open() (and on plain resizes) before the
	// layout has settled, computing a short column it then centers. Only a real
	// attribute *change* triggers a correct recompute, so we toggle one when the
	// container's size lands/changes. Coalesced to one per frame.
	let relayoutRaf = 0;
	function scheduleRelayout() {
		cancelAnimationFrame(relayoutRaf);
		relayoutRaf = requestAnimationFrame(() => {
			const r = view?.renderer;
			const mc = r?.getAttribute("max-column-count");
			if (!r || mc == null) return;
			r.removeAttribute("max-column-count");
			r.setAttribute("max-column-count", mc);
		});
	}

	function applyRenderer() {
		if (!view?.renderer) return;
		const r = view.renderer;
		const cols = settings.singleColumn ? 1 : 2;
		// foliate picks columns = min(maxColumnCount, ceil(width / maxInlineSize))
		// and fills the container. Sizing maxInlineSize to one column's share of
		// the sheet yields exactly `cols` columns that fill it with no side bands.
		const bookPx = bookWidthRem * 16;
		const maxInline = Math.max(
			200,
			Math.floor((bookPx - 2 * PAGE_MARGIN) / cols),
		);
		r.setAttribute("flow", settings.flow);
		r.setAttribute("max-inline-size", String(maxInline));
		// NOTE: do NOT set the `margin` attribute — setting it *together* with
		// max-inline-size makes foliate compute a short, vertically-centered page
		// (each alone is fine). Use foliate's default margin instead.
		r.setAttribute("max-column-count", String(cols));
		r.setStyles?.(contentCSS(settings));
	}

	// Persist + live-apply whenever settings change (once the view exists).
	$effect(() => {
		const snap = $state.snapshot(settings);
		try {
			localStorage.setItem("paper.reader", JSON.stringify(snap));
		} catch {}
		if (ready) applyRenderer();
	});

	// Page-turn animation: slide the current page out + fade, swap the content
	// while it's hidden (so you never see columns scroll past), then slide the
	// new page in from the opposite side. Foliate's own scroll-animation is left
	// off — this looks cleaner, especially in two-column mode.
	const TURN_MS = 160;
	const SLIDE = 8; // px
	let animating = false;
	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

	async function turn(dir: 1 | -1) {
		if (!view) return;
		if (settings.flow !== "paginated") {
			dir > 0 ? view.next() : view.prev();
			return;
		}
		if (animating) return;
		animating = true;
		const el = view as HTMLElement;
		try {
			el.style.willChange = "transform, opacity";
			el.style.transition = `transform ${TURN_MS}ms ease-in, opacity ${TURN_MS}ms ease-in`;
			el.style.transform = `translateX(${dir > 0 ? -SLIDE : SLIDE}px)`;
			el.style.opacity = "0";
			await wait(TURN_MS);

			await (dir > 0 ? view.next() : view.prev());

			// place the incoming page just off the opposite edge, then settle in
			el.style.transition = "none";
			el.style.transform = `translateX(${dir > 0 ? SLIDE : -SLIDE}px)`;
			el.getBoundingClientRect(); // force reflow so the next transition runs
			el.style.transition = `transform ${TURN_MS}ms ease-out, opacity ${TURN_MS}ms ease-out`;
			el.style.transform = "translateX(0)";
			el.style.opacity = "1";
			await wait(TURN_MS);
		} finally {
			el.style.willChange = "";
			el.style.transition = "";
			el.style.transform = "";
			animating = false;
		}
	}

	function next() {
		turn(1);
	}
	function prev() {
		turn(-1);
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === "ArrowRight" || e.key === " ") {
			e.preventDefault();
			next();
		} else if (e.key === "ArrowLeft") {
			e.preventDefault();
			prev();
		}
	}

	// Trackpad: a horizontal two-finger swipe turns one page. One continuous
	// gesture (incl. momentum) = one turn — we lock after the first move and
	// release only once wheel events stop for a beat. preventDefault also stops
	// the browser's back/forward swipe navigation.
	let wheelLock = false;
	let wheelIdle: ReturnType<typeof setTimeout> | undefined;
	function onWheel(e: WheelEvent) {
		if (settings.flow !== "paginated") return;
		if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // horizontal-dominant only
		e.preventDefault();
		clearTimeout(wheelIdle);
		wheelIdle = setTimeout(() => (wheelLock = false), 50);
		if (wheelLock || Math.abs(e.deltaX) < 8) return;
		wheelLock = true;
		if (e.deltaX > 0) next();
		else prev();
	}

	// Load foliate-js from /static via a module <script> tag — vite forbids
	// import()-ing files in the public dir. view.js registers <foliate-view> at
	// module top level, so the element exists once the load event fires.
	function loadFoliate(): Promise<void> {
		if (customElements.get("foliate-view")) return Promise.resolve();
		return new Promise((resolve, reject) => {
			const existing = document.querySelector<HTMLScriptElement>(
				"script[data-foliate]",
			);
			if (existing) {
				existing.addEventListener("load", () => resolve());
				existing.addEventListener("error", () =>
					reject(new Error("foliate failed to load")),
				);
				return;
			}
			const s = document.createElement("script");
			s.type = "module";
			s.src = "/foliate-js/view.js";
			s.dataset.foliate = "";
			s.addEventListener("load", () => resolve());
			s.addEventListener("error", () =>
				reject(new Error("foliate failed to load")),
			);
			document.head.append(s);
		});
	}

	$effect(() => {
		let destroyed = false;
		// Don't persist position until after we've restored it — the initial
		// render fires `relocate` at the book's start and would clobber the save.
		let canPersist = false;
		let ro: ResizeObserver | undefined;

		(async () => {
			try {
				const bid = id;
				book = await api.library.get(bid);
				await loadFoliate();
				if (destroyed) return;

				view = document.createElement("foliate-view");
				// Absolute-fill the container so foliate gets a *definite* height.
				// A flex-stretched box renders full-height but is "indefinite" for
				// percentage children, which collapses foliate's inner iframe.
				view.style.position = "absolute";
				view.style.inset = "0";
				container.append(view);
				container.addEventListener("wheel", onWheel, {
					passive: false,
				});

				// Recompute foliate's page height whenever the container's size
				// settles/changes (fires on first real layout + every resize).
				ro = new ResizeObserver(() => scheduleRelayout());
				ro.observe(container);

				view.addEventListener("relocate", (e: any) => {
					fraction = e.detail?.fraction ?? 0;
					const l = e.detail?.location;
					if (l && typeof l.total === "number")
						loc = { current: l.current ?? 0, total: l.total };
					chapterLabel = e.detail?.tocItem?.label ?? "";
					// foliate pads each section with a blank page front and back, so
					// content pages are index 1..(pages-2); see calibration.
					chapterPageRaw = view?.renderer?.page ?? 0;
					chapterPagesRaw = view?.renderer?.pages ?? 0;
					if (canPersist && e.detail?.cfi) {
						try {
							localStorage.setItem(posKey(bid), e.detail.cfi);
						} catch {}
					}
				});
				// Each section renders in its own iframe document; attach the wheel
				// handler to each as it loads (the swipe lands on the content, not us).
				view.addEventListener("load", (e: any) => {
					e.detail?.doc?.addEventListener("wheel", onWheel, {
						passive: false,
					});
					// Arrow/space keys fire on the section's own document when focus is
					// inside the iframe, so they never reach the window listener.
					e.detail?.doc?.addEventListener("keydown", onKey);
					// A section just rendered — force foliate to recompute its page
					// height now that content exists (it measures short at open()).
					scheduleRelayout();
				});

				// Capture the saved position *before* opening (open triggers relocate).
				let saved: string | null = null;
				try {
					saved = localStorage.getItem(posKey(bid));
				} catch {}

				await view.open(`/api/book/${bid}`);
				if (destroyed) {
					view.close?.();
					return;
				}

				const md = view.book?.metadata ?? {};
				metaTitle = pickText(md.title);
				metaAuthor = authorName(md.author);

				ready = true;
				applyRenderer();

				try {
					if (saved) await view.goTo(saved);
					else await view.goToFraction?.(0);
				} catch {
					await view.goToFraction?.(0);
				}
				canPersist = true;
			} catch (e: any) {
				error = e?.message ?? String(e);
			}
		})();

		window.addEventListener("keydown", onKey);
		return () => {
			destroyed = true;
			window.removeEventListener("keydown", onKey);
			container?.removeEventListener("wheel", onWheel);
			ro?.disconnect();
			cancelAnimationFrame(relayoutRaf);
			clearTimeout(wheelIdle);
			view?.close?.();
			view?.remove?.();
			view = null;
		};
	});

	function adjust(key: "fontSize" | "lineHeight", delta: number) {
		if (key === "fontSize")
			settings.fontSize = Math.min(
				220,
				Math.max(60, settings.fontSize + delta),
			);
		else
			settings.lineHeight =
				Math.round(
					Math.min(2.4, Math.max(1.1, settings.lineHeight + delta)) *
						10,
				) / 10;
	}

	const menuItems = $derived<PopoverMenuEntry[]>([
		{ kind: "header", label: "Theme" },
		{
			kind: "radio",
			options: [
				{ value: "light", label: "Light" },
				{ value: "sepia", label: "Sepia" },
				{ value: "dark", label: "Dark" },
			],
			value: settings.theme,
			onChange: (v: string) => (settings.theme = v as ThemeName),
		},
		"divider",
		{ kind: "custom", render: typography },
		"divider",
		{
			kind: "toggle",
			label: "Justify text",
			checked: settings.justify,
			onChange: (v: boolean) => (settings.justify = v),
		},
		{
			kind: "toggle",
			label: "Realistic pages",
			checked: settings.shading,
			onChange: (v: boolean) => (settings.shading = v),
		},
		{ kind: "header", label: "Layout" },
		{
			kind: "radio",
			options: [
				{ value: "paginated", label: "Paged" },
				{ value: "scrolled", label: "Scroll" },
			],
			value: settings.flow,
			onChange: (v: string) => (settings.flow = v as Settings["flow"]),
		},
		{
			kind: "radio",
			options: [
				{ value: "auto", label: "Two-page" },
				{ value: "single", label: "Single" },
			],
			value: settings.singleColumn ? "single" : "auto",
			onChange: (v: string) => (settings.singleColumn = v === "single"),
		},
	]);
</script>

{#snippet typography()}
	<div class="typo">
		<div class="typo-row">
			<span>Text size</span>
			<div class="stepper">
				<button
					onclick={() => adjust("fontSize", -10)}
					aria-label="Smaller text">A−</button
				>
				<span class="v">{settings.fontSize}%</span>
				<button
					onclick={() => adjust("fontSize", 10)}
					aria-label="Larger text">A+</button
				>
			</div>
		</div>
		<div class="typo-row">
			<span>Line spacing</span>
			<div class="stepper">
				<button
					onclick={() => adjust("lineHeight", -0.1)}
					aria-label="Tighter lines">−</button
				>
				<span class="v">{settings.lineHeight.toFixed(1)}</span>
				<button
					onclick={() => adjust("lineHeight", 0.1)}
					aria-label="Looser lines">+</button
				>
			</div>
		</div>
	</div>
{/snippet}

<div
	class="reader"
	style="--bg:{theme.bg};--fg:{theme.fg};--dim:{theme.dim};--chrome:{theme.chrome};--border:{theme.border};--link:{theme.link};--surface:{theme.surface};"
>
	<header>
		<a
			class="icon-btn back"
			href="/"
			title="Back to shelf"
			aria-label="Back to shelf">←</a
		>
		<div class="titles">
			<span class="title">{displayTitle}</span>
			{#if metaAuthor}<span class="author">{metaAuthor}</span>{/if}
		</div>
		<PopoverMenu items={menuItems} align="right">
			{#snippet trigger()}
				<Button variant="ghost" icon="Type" />
			{/snippet}
		</PopoverMenu>
	</header>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	<div class="stage" class:shaded={showStacks}>
		{#if settings.flow === "paginated"}
			<button class="nav left" onclick={prev} aria-label="Previous page"
				>‹</button
			>
		{/if}
		<div class="book" style="width:{bookWidthRem}rem">
			{#if showStacks}
				<div
					class="stack left"
					style="width:{leftStackPx}px"
					aria-hidden="true"
				></div>
			{/if}
			<div class="view" bind:this={container}>
				{#if showSpine}<div class="spine" aria-hidden="true"></div>{/if}
				{#if settings.shading}
					<svg class="grain" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
						<filter id="paper-grain">
							<feTurbulence
								type="fractalNoise"
								baseFrequency="0.8"
								numOctaves="1"
								stitchTiles="stitch"
							/>
							<feColorMatrix type="saturate" values="0" />
						</filter>
						<rect width="100%" height="100%" filter="url(#paper-grain)" />
					</svg>
				{/if}
			</div>
			{#if showStacks}
				<div
					class="stack right"
					style="width:{rightStackPx}px"
					aria-hidden="true"
				></div>
			{/if}
		</div>
		{#if settings.flow === "paginated"}
			<button class="nav right" onclick={next} aria-label="Next page"
				>›</button
			>
		{/if}
	</div>

	{#if showPageInfo}
		<div class="statusbar">
			<span class="chap" title={chapterLabel}>{chapterLabel}</span>
			<span class="pages">
				{chapterPage} / {chapterPages}
				{#if chapterLeft > 0}
					· {chapterLeft} left in chapter
				{/if}
			</span>
		</div>
	{/if}

	<div class="progress" aria-hidden="true">
		<div class="bar" style="width:{fraction * 100}%"></div>
	</div>
</div>

<style>
	.reader {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: var(--bg);
		color: var(--fg);
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}
	header {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: var(--chrome);
		border-bottom: 1px solid var(--border);
		flex: 0 0 auto;
		z-index: 3;
	}
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.1rem;
		height: 2.1rem;
		padding: 0 0.5rem;
		border-radius: 0.5rem;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--fg);
		text-decoration: none;
		font-size: 0.95rem;
		cursor: pointer;
	}
	.icon-btn:hover {
		background: color-mix(in srgb, var(--fg) 8%, transparent);
	}
	.titles {
		flex: 1;
		min-width: 0;
		text-align: center;
		display: flex;
		flex-direction: column;
		line-height: 1.2;
	}
	.title {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.author {
		font-size: 0.78rem;
		color: var(--dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.error {
		color: #cf222e;
		padding: 0.5rem 1rem;
	}
	.stage {
		flex: 1;
		min-height: 0;
		display: flex;
		justify-content: center;
		/* the "desk" the book rests on */
		background: var(--surface);
		padding: clamp(0.75rem, 2.5vh, 1.75rem) 0;
		transition: background 0.2s ease;
	}
	.book {
		/* width is set inline (reading width); the nav buttons take the rest */
		flex: 0 1 auto;
		max-width: 100%;
		min-width: 0;
		/* explicit height so foliate-view's height:100% resolves to a definite
		   value — otherwise foliate measures the page short and centers it */
		height: 100%;
		display: flex;
		align-items: stretch;
		background: var(--bg);
		border-radius: 12px;
		overflow: hidden;
		box-shadow:
			0 10px 30px rgba(0, 0, 0, 0.22),
			0 2px 8px rgba(0, 0, 0, 0.12);
	}
	.view {
		position: relative;
		flex: 1;
		min-width: 0;
		height: 100%;
		overflow: hidden;
	}

	/* paper grain overlaid on the page (over the iframe text, non-interactive) */
	.grain {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 4;
		pointer-events: none;
		opacity: 0.2;
	}

	/* center spine / gutter shadow of an open book */
	.spine {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 170px;
		transform: translateX(-50%);
		z-index: 5;
		pointer-events: none;
		background: linear-gradient(
			to right,
			rgba(0, 0, 0, 0) 0%,
			rgba(0, 0, 0, 0.05) 38%,
			rgba(0, 0, 0, 0.16) 48%,
			rgba(0, 0, 0, 0.22) 50%,
			rgba(0, 0, 0, 0.16) 52%,
			rgba(0, 0, 0, 0.05) 62%,
			rgba(0, 0, 0, 0) 100%
		);
	}

	/* physical-book page-edge stacks */
	.stack {
		flex: 0 0 auto;
		align-self: stretch;
		pointer-events: none;
		background-color: var(--bg);
		/* thin vertical lines = stacked page edges; count scales with width */
		background-image: repeating-linear-gradient(
			to right,
			color-mix(in srgb, var(--fg) 10%, transparent) 0 1px,
			transparent 1px 2.5px
		);
		transition: width 0.18s ease;
	}
	.stack.left {
		/* recess shadow toward the reading page (right edge) + outer-edge darkening */
		box-shadow:
			inset -7px 0 9px -7px rgba(0, 0, 0, 0.5),
			inset 3px 0 4px -3px rgba(0, 0, 0, 0.35);
		border-radius: 2px 0 0 2px;
	}
	.stack.right {
		box-shadow:
			inset 7px 0 9px -7px rgba(0, 0, 0, 0.5),
			inset -3px 0 4px -3px rgba(0, 0, 0, 0.35);
		border-radius: 0 2px 2px 0;
	}
	.nav {
		/* grow to fill the desk out to the screen edge — the whole side is a
		   click target for turning the page */
		flex: 1 1 0;
		min-width: 3rem;
		border: none;
		background: transparent;
		color: var(--dim);
		font-size: 2rem;
		opacity: 0.5;
		cursor: pointer;
		transition:
			opacity 0.15s ease,
			color 0.15s ease;
	}
	.nav:hover {
		opacity: 1;
		color: var(--fg);
	}
	.statusbar {
		flex: 0 0 auto;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.4rem 1rem;
		font-size: 0.78rem;
		color: var(--dim);
		background: var(--chrome);
		border-top: 1px solid var(--border);
	}
	.statusbar .chap {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.statusbar .pages {
		flex: 0 0 auto;
		font-variant-numeric: tabular-nums;
	}
	.progress {
		flex: 0 0 auto;
		height: 3px;
		background: var(--border);
	}
	.bar {
		height: 100%;
		background: var(--link);
		transition: width 0.2s ease;
	}

	/* custom typography block inside the glow PopoverMenu */
	.typo {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.25rem 0.15rem;
	}
	.typo-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		font-size: 0.85rem;
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.stepper button {
		border: 1px solid var(--glow-border-color, rgba(127, 127, 127, 0.3));
		background: transparent;
		color: inherit;
		border-radius: 0.4rem;
		min-width: 1.8rem;
		height: 1.8rem;
		cursor: pointer;
	}
	.stepper .v {
		min-width: 2.8rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
		opacity: 0.7;
	}
</style>
