import { untrack } from "svelte";
import type { PopoverMenuEntry } from "glow";
import * as library from "$lib/library";
import { posKey, type Book } from "$lib/library";
import { THEMES, contentCSS, type Theme } from "./themes";
import type { ReaderSettings } from "./settings.svelte";
import { FootnoteController } from "./footnotes.svelte";
import { FoldController } from "./folds.svelte";
import {
	authorName,
	flattenToc,
	loadFoliate,
	pickText,
	type TocEntry,
} from "./foliate";

const PAGE_MARGIN = 48; // foliate's default; used only to size columns
const TURN_MS = 160;
const SLIDE = 8; // px

/**
 * Owns the foliate `<foliate-view>` and every piece of reader state. The route
 * instantiates one of these, calls `connect()` once (settings → renderer
 * reactivity) and `load(id, container)` per book, and renders the reactive
 * fields/derived values below. All the gnarly foliate workarounds live here.
 */
export class ReaderController {
	// ── reactive state ─────────────────────────────────────────────
	book = $state<Book | null>(null);
	metaTitle = $state("");
	metaAuthor = $state("");
	error = $state<string | null>(null);
	fraction = $state(0);
	loc = $state<{ current: number; total: number } | null>(null);
	chapterLabel = $state("");
	toc = $state<TocEntry[]>([]);
	currentHref = $state("");
	chapterPageRaw = $state(0); // foliate's raw page index (0 = leading pad)
	chapterPagesRaw = $state(0); // includes 1 leading + 1 trailing pad page
	// The visible page's Range, as foliate hands it to us — bisected to the
	// character where visibility changes. For features that need the page's
	// *content* and not just its index; it dies with its section's document.
	visibleRange = $state<Range | null>(null);
	ready = $state(false);
	isFullscreen = $state(false);

	/** Footnote references open in a popover instead of navigating; see there. */
	footnotes: FootnoteController;
	/** Dog-eared pages, anchored to CFIs; see folds.svelte.ts. */
	folds = new FoldController();

	// ── private engine refs ────────────────────────────────────────
	#settings: ReaderSettings;
	#view: any = null;
	#container: HTMLElement | null = null;
	#relayoutRaf = 0;
	#animating = false;
	#wheelLock = false;
	#wheelIdle: ReturnType<typeof setTimeout> | undefined;
	#ro: ResizeObserver | undefined;
	#destroyed = false;
	// Sections render in their own iframe documents, so anything that needs to
	// watch the text (selections, footnote clicks) has to be handed each one as
	// it arrives. A set rather than one slot: several features want this, and a
	// single slot would let whichever mounted last silently displace the rest.
	#sectionListeners = new Set<(doc: Document, index: number) => void>();
	// Don't persist position until after we've restored it — the initial render
	// fires `relocate` at the book's start and would clobber the save.
	#canPersist = false;
	#rendererDispose: (() => void) | null = null;

	constructor(settings: ReaderSettings) {
		this.#settings = settings;
		this.footnotes = new FootnoteController(settings);
	}

	get settings(): ReaderSettings {
		return this.#settings;
	}

	/** foliate's own view, for the few features that need its API directly. */
	get view(): any {
		return this.#view;
	}

	// ── derived display values ─────────────────────────────────────
	theme: Theme = $derived.by(() => THEMES[this.#settings.theme]);

	// Content pages in the current chapter (strip foliate's pad pages), the
	// current 1-based page, and how many remain to the chapter's end.
	chapterPages = $derived(Math.max(1, this.chapterPagesRaw - 2));
	chapterPage = $derived(
		Math.min(this.chapterPages, Math.max(1, this.chapterPageRaw)),
	);
	chapterLeft = $derived(Math.max(0, this.chapterPages - this.chapterPage));
	showPageInfo = $derived.by(
		() => this.#settings.flow === "paginated" && this.chapterPagesRaw > 2,
	);

	displayTitle = $derived(this.metaTitle || this.book?.title || "");

	// ── physical-book page stacks ──────────────────────────────────
	// foliate's `location` is its synthetic page count (~1 per 1500 chars). Use
	// it to size the read (left) vs. remaining (right) stacks; total thickness
	// scales with book length but is capped so a huge book stays sane.
	showStacks = $derived.by(
		() =>
			this.#settings.shading &&
			this.#settings.flow === "paginated" &&
			!!this.loc &&
			this.loc.total > 0,
	);
	totalStackPx = $derived(
		this.loc
			? Math.min(64, Math.max(10, Math.round(Math.sqrt(this.loc.total) * 1.6)))
			: 0,
	);
	readRatio = $derived(
		this.loc && this.loc.total > 0
			? Math.min(1, Math.max(0, this.loc.current / this.loc.total))
			: 0,
	);
	leftStackPx = $derived(Math.round(this.totalStackPx * this.readRatio));
	rightStackPx = $derived(Math.round(this.totalStackPx * (1 - this.readRatio)));

	// Reading width of the book sheet (foliate fills it). Two-page mode is wide
	// enough for two columns; single is a single comfortable measure.
	bookWidthRem = $derived.by(() => (this.#settings.singleColumn ? 40 : 66));

	// Center "spine" gutter shadow — only in two-page paginated mode.
	showSpine = $derived.by(
		() =>
			this.#settings.shading &&
			this.#settings.flow === "paginated" &&
			!this.#settings.singleColumn,
	);

	chapterItems = $derived<PopoverMenuEntry[]>(
		this.toc.map((c) => ({
			kind: "item",
			// indent sub-items with en-spaces (preserved in flex labels)
			label: (c.depth > 0 ? " ".repeat(c.depth * 2) : "") + (c.label || "—"),
			selected: c.href === this.currentHref,
			onclick: () => this.goToChapter(c.href),
		})),
	);

	// ── lifecycle ──────────────────────────────────────────────────

	/**
	 * Start reactivity that lives for the controller's whole lifetime: re-apply
	 * the renderer whenever settings change (once a book is open). Returns a
	 * disposer; call it (or it runs as an `$effect` cleanup) on teardown.
	 */
	connect(): () => void {
		this.#rendererDispose?.();
		this.#rendererDispose = $effect.root(() => {
			$effect(() => {
				// Exactly the settings the renderer consumes, and nothing else:
				// applyRenderer re-paginates the book, so a dependency on the whole
				// snapshot meant toggling the paper grain or stepping the pacer's
				// wpm re-laid out every section for no visible reason.
				this.#settings.layout;
				const ready = this.ready;
				// applyRenderer reads .value for contentCSS; untracked, or it would
				// subscribe this effect right back to the fields just excluded.
				untrack(() => {
					if (ready) this.applyRenderer();
				});
			});
		});
		return () => {
			this.#rendererDispose?.();
			this.#rendererDispose = null;
		};
	}

	/** Open `bookId` inside `container`. Returns a teardown for this book. */
	load(bookId: number, container: HTMLElement): () => void {
		this.#destroyed = false;
		this.#canPersist = false;
		this.#container = container;

		(async () => {
			try {
				this.book = await library.get(bookId);
				await loadFoliate();
				if (this.#destroyed) return;

				const view = document.createElement("foliate-view") as any;
				this.#view = view;
				// Absolute-fill the container so foliate gets a *definite* height.
				// A flex-stretched box renders full-height but is "indefinite" for
				// percentage children, which collapses foliate's inner iframe.
				view.style.position = "absolute";
				view.style.inset = "0";
				container.append(view);
				container.addEventListener("wheel", this.onWheel, { passive: false });
				this.footnotes.attach(view);
				this.folds.attach(view, bookId);

				// Recompute foliate's page height whenever the container's size
				// settles/changes (fires on first real layout + every resize).
				this.#ro = new ResizeObserver(() => this.scheduleRelayout());
				this.#ro.observe(container);

				view.addEventListener("relocate", (e: any) => {
					this.fraction = e.detail?.fraction ?? 0;
					const l = e.detail?.location;
					if (l && typeof l.total === "number")
						this.loc = { current: l.current ?? 0, total: l.total };
					this.chapterLabel = e.detail?.tocItem?.label ?? "";
					this.currentHref = e.detail?.tocItem?.href ?? this.currentHref;
					// foliate pads each section with a blank page front and back, so
					// content pages are index 1..(pages-2); see calibration.
					this.chapterPageRaw = view?.renderer?.page ?? 0;
					this.chapterPagesRaw = view?.renderer?.pages ?? 0;
					this.visibleRange = e.detail?.range ?? null;
					if (this.#canPersist && e.detail?.cfi) {
						try {
							localStorage.setItem(posKey(bookId), e.detail.cfi);
						} catch {}
					}
				});
				// Each section renders in its own iframe document; attach the wheel
				// handler to each as it loads (the swipe lands on the content, not us).
				view.addEventListener("load", (e: any) => {
					this.footnotes.sectionLoaded(e.detail?.doc);
					e.detail?.doc?.addEventListener("wheel", this.onWheel, {
						passive: false,
					});
					// Arrow/space keys fire on the section's own document when focus is
					// inside the iframe, so they never reach the window listener.
					e.detail?.doc?.addEventListener("keydown", this.onKey);
					if (e.detail?.doc)
						for (const listen of this.#sectionListeners)
							listen(e.detail.doc, e.detail.index ?? -1);
					// A section just rendered — force foliate to recompute its page
					// height now that content exists (it measures short at open()).
					this.scheduleRelayout();
				});

				// Capture the saved position *before* opening (open triggers relocate).
				let saved: string | null = null;
				try {
					saved = localStorage.getItem(posKey(bookId));
				} catch {}

				// foliate accepts anything with `arrayBuffer()`, so the stored
				// File goes straight in — no object URL to revoke.
				await view.open(await library.file(bookId));
				if (this.#destroyed) {
					view.close?.();
					return;
				}

				const md = view.book?.metadata ?? {};
				this.metaTitle = pickText(md.title);
				this.metaAuthor = authorName(md.author);
				this.toc = flattenToc(view.book?.toc);

				this.ready = true;
				this.applyRenderer();

				try {
					if (saved) await view.goTo(saved);
					else await view.goToFraction?.(0);
				} catch {
					await view.goToFraction?.(0);
				}
				this.#canPersist = true;
			} catch (e: any) {
				this.error = e?.message ?? String(e);
			}
		})();

		window.addEventListener("keydown", this.onKey);
		document.addEventListener("fullscreenchange", this.#onFullscreen);

		return () => this.unload();
	}

	/**
	 * Subscribe to each section document as it renders, with the spine index it
	 * was rendered from. Returns an unsubscribe; `unload()` drops every listener,
	 * so a book switch can't leak them.
	 */
	onSection(listener: (doc: Document, index: number) => void): () => void {
		this.#sectionListeners.add(listener);
		return () => this.#sectionListeners.delete(listener);
	}

	unload() {
		this.#destroyed = true;
		this.footnotes.detach();
		this.#sectionListeners.clear();
		this.folds.detach();
		window.removeEventListener("keydown", this.onKey);
		document.removeEventListener("fullscreenchange", this.#onFullscreen);
		this.#container?.removeEventListener("wheel", this.onWheel);
		this.#ro?.disconnect();
		cancelAnimationFrame(this.#relayoutRaf);
		clearTimeout(this.#wheelIdle);
		this.#view?.close?.();
		this.#view?.remove?.();
		this.#view = null;
		this.ready = false;
	}

	// ── renderer / layout ──────────────────────────────────────────
	applyRenderer() {
		if (!this.#view?.renderer) return;
		const r = this.#view.renderer;
		const s = this.#settings;
		const cols = s.singleColumn ? 1 : 2;
		// foliate picks columns = min(maxColumnCount, ceil(width / maxInlineSize))
		// and fills the container. Sizing maxInlineSize to one column's share of
		// the sheet yields exactly `cols` columns that fill it with no side bands.
		const bookPx = this.bookWidthRem * 16;
		const maxInline = Math.max(
			200,
			Math.floor((bookPx - 2 * PAGE_MARGIN) / cols),
		);
		r.setAttribute("flow", s.flow);
		r.setAttribute("max-inline-size", String(maxInline));
		// NOTE: do NOT set the `margin` attribute — setting it *together* with
		// max-inline-size makes foliate compute a short, vertically-centered page
		// (each alone is fine). Use foliate's default margin instead.
		r.setAttribute("max-column-count", String(cols));
		r.setStyles?.(contentCSS(s.value));
	}

	// foliate measures the page height at open() (and on plain resizes) before
	// the layout has settled, computing a short column it then centers. Only a
	// real attribute *change* triggers a correct recompute, so we toggle one when
	// the container's size lands/changes. Coalesced to one per frame.
	scheduleRelayout() {
		cancelAnimationFrame(this.#relayoutRaf);
		this.#relayoutRaf = requestAnimationFrame(() => {
			const r = this.#view?.renderer;
			const mc = r?.getAttribute("max-column-count");
			if (!r || mc == null) return;
			r.removeAttribute("max-column-count");
			r.setAttribute("max-column-count", mc);
		});
	}

	// ── navigation ─────────────────────────────────────────────────
	// Page-turn animation: slide the current page out + fade, swap the content
	// while it's hidden (so you never see columns scroll past), then slide the
	// new page in from the opposite side. Foliate's own scroll-animation is left
	// off — this looks cleaner, especially in two-column mode.
	async #turn(dir: 1 | -1) {
		const view = this.#view;
		if (!view) return;
		if (this.#settings.flow !== "paginated") {
			dir > 0 ? view.next() : view.prev();
			return;
		}
		if (this.#animating) return;
		this.#animating = true;
		const el = view as HTMLElement;
		const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
			this.#animating = false;
		}
	}

	next = () => this.#turn(1);
	prev = () => this.#turn(-1);

	async goToChapter(href: string) {
		try {
			await this.#view?.goTo?.(href);
		} catch (e) {
			console.warn("goTo chapter failed", e);
		}
	}

	onKey = (e: KeyboardEvent) => {
		// Space and the arrows turn the page — but only when the page is what
		// they were aimed at. With a field focused (writing a note on a
		// character, say) they belong to the field, and typing a space would
		// otherwise turn the page out from under the cursor.
		if (isTyping(e.target)) return;
		if (e.key === "ArrowRight" || e.key === " ") {
			e.preventDefault();
			this.next();
		} else if (e.key === "ArrowLeft") {
			e.preventDefault();
			this.prev();
		}
	};

	// Trackpad: a horizontal two-finger swipe turns one page. One continuous
	// gesture (incl. momentum) = one turn — we lock after the first move and
	// release only once wheel events stop for a beat. preventDefault also stops
	// the browser's back/forward swipe navigation.
	onWheel = (e: WheelEvent) => {
		if (this.#settings.flow !== "paginated") return;
		if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // horizontal-dominant only
		e.preventDefault();
		clearTimeout(this.#wheelIdle);
		this.#wheelIdle = setTimeout(() => (this.#wheelLock = false), 50);
		if (this.#wheelLock || Math.abs(e.deltaX) < 8) return;
		this.#wheelLock = true;
		if (e.deltaX > 0) this.next();
		else this.prev();
	};

	// ── fullscreen ─────────────────────────────────────────────────
	#onFullscreen = () => {
		this.isFullscreen = !!document.fullscreenElement;
	};

	toggleFullscreen = () => {
		if (document.fullscreenElement) document.exitFullscreen?.();
		else document.documentElement.requestFullscreen?.().catch(() => {});
	};
}

/**
 * Whether a keystroke was aimed at somewhere text goes. Duck-typed rather than
 * `instanceof`: the reader's events can arrive from foliate's iframe, and an
 * element from another document fails an `instanceof` against this one's.
 */
function isTyping(target: EventTarget | null): boolean {
	const el = target as (HTMLElement & { tagName?: string }) | null;
	const tag = el?.tagName?.toLowerCase();
	return (
		tag === "input" ||
		tag === "textarea" ||
		tag === "select" ||
		el?.isContentEditable === true
	);
}
