import { contentCSS } from "./themes";
import type { ReaderSettings } from "./settings.svelte";

// ── popover geometry (px) ──────────────────────────────────────
const WIDTH = 400;
const MAX_HEIGHT = 320;
const MIN_HEIGHT = 84;
const ANCHOR_GAP = 10; // clearance between the reference and the popover
const EDGE = 12; // keep-off from the viewport edges
const NOTE_MARGIN = 8; // foliate's own block padding inside the note view
const CHROME = 30; // the popover's own header row

export type FootnoteBox = {
	left: number;
	top: number;
	width: number;
	height: number;
	above: boolean;
	caret: number; // caret's x offset inside the popover, pointing at the reference
};

type Rect = { left: number; right: number; top: number; bottom: number };

const clamp = (v: number, lo: number, hi: number) =>
	Math.max(lo, Math.min(hi, v));

/**
 * `el`'s rect in the *top* document's coordinates. Sections render inside
 * foliate's nested iframes, so every frame's own offset has to be folded in —
 * and in paginated mode the frame is scrolled off to the side, which its rect
 * already accounts for.
 */
function viewportRect(el: Element): Rect {
	const r = el.getBoundingClientRect();
	const out = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
	let win: Window | null = el.ownerDocument.defaultView;
	while (win?.frameElement) {
		const f = win.frameElement.getBoundingClientRect();
		out.left += f.left;
		out.right += f.left;
		out.top += f.top;
		out.bottom += f.top;
		win = win.frameElement.ownerDocument.defaultView;
	}
	return out;
}

const OPS_NS = "http://www.idpf.org/2007/ops";

const isBacklink = (a: Element | null | undefined) =>
	!!a &&
	((a.getAttributeNS(OPS_NS, "type") ?? "").split(" ").includes("backlink") ||
		(a.getAttribute("role") ?? "").split(" ").includes("doc-backlink"));

// keys that move the reading position, which would strand an open note
const TURN_KEYS = new Set(["ArrowLeft", "ArrowRight", " "]);

const HANDLER_URL = "/foliate-js/footnotes.js";
let handlerClass: Promise<any> | null = null;

// footnotes.js lives in /static, which vite refuses to bundle — fetch it from
// its URL at runtime, the same deal as loadFoliate() and view.js.
function loadFootnoteHandler(): Promise<any> {
	handlerClass ??= import(/* @vite-ignore */ HANDLER_URL).then(
		(m) => m.FootnoteHandler,
	);
	return handlerClass;
}

/**
 * Turns footnote/endnote references into a popover next to the reference
 * instead of a jump to the notes section. Detection is foliate's
 * `FootnoteHandler` (epub:type, ARIA roles, superscript heuristics); this class
 * owns the placement, the note's own `<foliate-view>`, and dismissal.
 *
 * The controller keeps no DOM of its own: `FootnotePopover.svelte` calls
 * `register()` with the box it draws, and the note renders into it.
 */
export class FootnoteController {
	// ── reactive state ─────────────────────────────────────────────
	open = $state(false);
	pending = $state(false);
	/** foliate's classification of the note: "endnote", "footnote", … */
	kind = $state<string | null>(null);

	// ── private refs ───────────────────────────────────────────────
	#settings: ReaderSettings;
	#Handler: any = null;
	#view: any = null; // the reader's view — never navigated by a popover
	#note: any = null; // throwaway view rendering the note fragment
	#root: HTMLElement | null = null;
	#host: HTMLElement | null = null;
	#noteDoc: Document | null = null;
	#href = "";
	#index = -1; // section the reference lives in
	// Bumped per click; a render that arrives with a stale token is ignored,
	// which is what makes rapid clicks (and dismissal mid-load) safe.
	#token = 0;
	#rect = $state<Rect | null>(null);
	#natural = $state(MAX_HEIGHT); // note's own height, measured after render
	#fitRaf = 0;

	constructor(settings: ReaderSettings) {
		this.#settings = settings;
	}

	// Centred on the reference and below it, flipped above when the note doesn't
	// fit there and there's more room up top, clamped to the viewport either way.
	box = $derived.by<FootnoteBox>(() => {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const width = Math.min(WIDTH, vw - 2 * EDGE);
		const r = this.#rect ?? {
			left: vw / 2,
			right: vw / 2,
			top: vh / 2,
			bottom: vh / 2,
		};
		const below = vh - r.bottom - ANCHOR_GAP - EDGE;
		const above = r.top - ANCHOR_GAP - EDGE;
		const want = Math.min(this.#natural, MAX_HEIGHT);
		const useAbove = want > below && above > below;
		const room = Math.max(MIN_HEIGHT, useAbove ? above : below);
		const height = clamp(want, MIN_HEIGHT, room);
		const left = clamp(
			(r.left + r.right) / 2 - width / 2,
			EDGE,
			Math.max(EDGE, vw - width - EDGE),
		);
		return {
			width,
			height,
			left,
			top: useAbove ? r.top - ANCHOR_GAP - height : r.bottom + ANCHOR_GAP,
			above: useAbove,
			caret: clamp((r.left + r.right) / 2 - left, 14, width - 14),
		};
	});

	// ── wiring ─────────────────────────────────────────────────────

	/** `root` is the popover element (click-away test); `host` holds the note. */
	register(root: HTMLElement, host: HTMLElement) {
		this.#root = root;
		this.#host = host;
	}

	/** Intercept `link` events from the reader's view. */
	attach(view: any) {
		this.#view = view;
		// Detection has to be synchronous inside the `link` event (foliate reads
		// `defaultPrevented` to decide whether to navigate), so load the module
		// now; a click before it lands just navigates as it always did.
		loadFootnoteHandler()
			.then((H) => (this.#Handler = H))
			.catch((e) => console.warn("footnotes unavailable", e));
		view.addEventListener("link", this.#onLink);
		window.addEventListener("pointerdown", this.#onPointerDown, true);
		window.addEventListener("keydown", this.#onKey, true);
		window.addEventListener("wheel", this.#onWheel, true);
		window.addEventListener("resize", this.dismiss);
	}

	/** Each section is its own document, so it needs its own dismiss listeners. */
	sectionLoaded(doc: Document | null | undefined) {
		doc?.addEventListener("pointerdown", this.#onPointerDown, true);
		doc?.addEventListener("keydown", this.#onKey, true);
		doc?.addEventListener("wheel", this.#onWheel, {
			capture: true,
			passive: true,
		});
	}

	detach() {
		this.dismiss();
		this.#view?.removeEventListener?.("link", this.#onLink);
		window.removeEventListener("pointerdown", this.#onPointerDown, true);
		window.removeEventListener("keydown", this.#onKey, true);
		window.removeEventListener("wheel", this.#onWheel, true);
		window.removeEventListener("resize", this.dismiss);
		this.#view = null;
	}

	// ── opening ────────────────────────────────────────────────────
	#onLink = (e: any) => {
		const a: Element | undefined = e.detail?.a;
		const href: string | undefined = e.detail?.href;
		const book = this.#view?.book;
		if (!this.#Handler || !a || !href || !book) return;

		const handler = new this.#Handler();
		const token = this.#token + 1;
		handler.addEventListener("before-render", (ev: any) => {
			if (token === this.#token) this.#mount(ev.detail.view);
		});
		handler.addEventListener("render", (ev: any) => {
			if (token === this.#token) this.#rendered(ev.detail);
		});

		// `handle` returns a promise only for references it claims (and only then
		// has it prevented the navigation) — anything else is a plain link.
		const claimed = handler.handle(book, e);
		if (!claimed) return;

		this.#href = href;
		this.#rect = viewportRect(a);
		this.#index = this.#view?.renderer?.getContents?.()?.[0]?.index ?? -1;
		this.#natural = MAX_HEIGHT;
		this.#token = token;
		this.kind = null;
		this.pending = true;
		this.open = true;

		claimed.catch((err: unknown) => {
			console.warn("footnote extraction failed", err);
			if (token === this.#token) this.#navigate();
		});
	};

	// The note renders in its own view, which foliate sizes from its container —
	// so it has to be in the popover before it renders anything.
	#mount(note: any) {
		this.#discard();
		this.#note = note;
		note.style.position = "absolute";
		note.style.inset = "0";
		this.#host?.append(note);
		note.addEventListener("link", this.#onNoteLink);
		// the note is its own document too — Escape has to work with focus in there
		note.addEventListener("load", (e: any) => {
			this.#noteDoc = e.detail?.doc ?? null;
			this.#noteDoc?.addEventListener("keydown", this.#onKey, true);
		});
		const r = note.renderer;
		r?.setAttribute("flow", "scrolled"); // long notes scroll, never paginate
		r?.setAttribute("gap", "6%");
		r?.setAttribute("margin", `${NOTE_MARGIN}px`);
		r?.setAttribute("max-inline-size", `${this.box.width}px`);
		r?.setStyles?.(contentCSS(this.#settings.value));
	}

	#rendered(detail: any) {
		this.pending = false;
		this.kind = typeof detail?.type === "string" ? detail.type : null;
		const doc: Document | undefined =
			this.#note?.renderer?.getContents?.()?.[0]?.doc;
		const body = doc?.body;
		const empty =
			!body ||
			(!body.textContent?.trim() && !body.querySelector("img, svg, video"));
		// Detected as a reference but there was nothing to show — hand the click
		// back to foliate rather than leaving an empty popover.
		if (!detail?.target || empty) {
			this.#navigate();
			return;
		}
		this.#fit(doc!);
	}

	// Shrink to the note's own height when it's short. In scrolled flow <html>
	// lays out at its content height, which is the measurement we want.
	#fit(doc: Document) {
		cancelAnimationFrame(this.#fitRaf);
		this.#fitRaf = requestAnimationFrame(() => {
			const h = doc.documentElement?.getBoundingClientRect?.().height ?? 0;
			if (h > 0) this.#natural = Math.ceil(h) + 2 * NOTE_MARGIN + CHROME;
		});
	}

	// ── dismissal / links out ──────────────────────────────────────
	dismiss = () => {
		if (!this.open && !this.#note) return;
		this.#token++; // anything still loading is stale now
		this.open = false;
		this.pending = false;
		this.kind = null;
		this.#discard();
	};

	/** Fall back to what the click used to do: go to the note. */
	#navigate() {
		const href = this.#href;
		this.dismiss();
		this.#view?.goTo?.(href)?.catch?.(() => {});
	}

	#discard() {
		const note = this.#note;
		this.#note = null;
		cancelAnimationFrame(this.#fitRaf);
		this.#noteDoc = null;
		if (!note) return;
		note.removeEventListener("link", this.#onNoteLink);
		// Tear down a frame late: foliate schedules style work with rAF, and
		// closing the view out from under a pending callback throws inside it.
		requestAnimationFrame(() => {
			try {
				note.close?.();
			} catch {}
			note.remove?.();
		});
	}

	// A link inside the note: the note's own view must never navigate (it holds
	// nothing but the fragment), so every case is handled here.
	#onNoteLink = (e: any) => {
		e.preventDefault();
		const a: Element | undefined = e.detail?.a;
		const href: string | undefined = e.detail?.href;
		if (!href) return;
		const book = this.#view?.book;
		this.dismiss();
		if (isBacklink(a)) return;
		// An unmarked backlink still lands in the section we're reading; going
		// there would only lose the place we just kept. Anything else is a real
		// navigation and behaves like any other link.
		Promise.resolve(book?.resolveHref?.(href))
			.then((t: any) =>
				t?.index === this.#index ? null : this.#view?.goTo?.(href),
			)
			.catch(() => {});
	};

	// Anywhere that isn't the popover or the note's own document: dismiss. The
	// note lives in an iframe, so it is never `contains`ed by the popover.
	#outside(e: Event) {
		const t = e.target;
		if (!(t instanceof Node)) return true;
		return !this.#root?.contains(t) && t.ownerDocument !== this.#noteDoc;
	}

	#onPointerDown = (e: Event) => {
		if (this.open && this.#outside(e)) this.dismiss();
	};

	#onWheel = (e: WheelEvent) => {
		// scrolling or swiping the book moves the reference out from under it
		if (this.open && this.#outside(e)) this.dismiss();
	};

	#onKey = (e: KeyboardEvent) => {
		if (!this.open) return;
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			this.dismiss();
			return;
		}
		if (TURN_KEYS.has(e.key) && this.#outside(e)) this.dismiss();
	};
}
