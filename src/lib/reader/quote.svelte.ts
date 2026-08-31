import type { Theme } from "./themes";

// A card is 1080² of fixed size, so the passage has to be bounded: past
// MAX_CHARS the text is trimmed at a word boundary, and past REFUSE_CHARS we
// decline instead of bisecting the type down to an unreadable smear.
const MAX_CHARS = 600;
export const REFUSE_CHARS = 1800;
const MIN_CHARS = 2;
// Only a *settled* selection gets the affordance: the pointer is up and the
// range has stopped changing. Otherwise the button chases the cursor mid-drag.
const SETTLE_MS = 200;

export type QuoteMeta = { title: string; author: string; theme: Theme };

/** One line, no runs of whitespace — epub markup is full of both. */
function normalize(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

function trim(s: string): string {
	if (s.length <= MAX_CHARS) return s;
	const cut = s.slice(0, MAX_CHARS);
	const space = cut.lastIndexOf(" ");
	return (space > MAX_CHARS * 0.6 ? cut.slice(0, space) : cut).trimEnd() + "…";
}

function slug(s: string): string {
	return (
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 60) || "quote"
	);
}

/** The card renderer is a custom element in /static — load it like view.js. */
function loadQuoteImage(): Promise<void> {
	if (customElements.get("foliate-quoteimage")) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const existing = document.querySelector<HTMLScriptElement>(
			"script[data-quoteimage]",
		);
		const s = existing ?? document.createElement("script");
		s.addEventListener("load", () => resolve());
		s.addEventListener("error", () =>
			reject(new Error("quote renderer failed to load")),
		);
		if (existing) return;
		s.type = "module";
		s.src = "/foliate-js/quote-image.js";
		s.dataset.quoteimage = "";
		document.head.append(s);
	});
}

/**
 * Selection → shareable card. `observe()` gets called with each section
 * document as it renders (sections live in their own iframes, so selection
 * events never reach the top document); a settled selection publishes `text`
 * plus a top-document `anchor` for the floating action, and `render()` turns it
 * into a PNG blob via the `<foliate-quoteimage>` element.
 */
export class QuoteCards {
	// ── reactive state ─────────────────────────────────────────────
	/** Non-empty while a settled selection is offering a card. */
	text = $state("");
	anchor = $state<{ x: number; y: number } | null>(null);
	/** Characters actually selected, before trimming. */
	length = $state(0);
	truncated = $state(false);
	tooLong = $state(false);
	open = $state(false);
	busy = $state(false);
	url = $state<string | null>(null);
	note = $state("");

	#blob: Blob | null = null;
	#filename = "quote.png";
	#docs = new Map<Document, () => void>();
	#settle: ReturnType<typeof setTimeout> | undefined;
	#noteTimer: ReturnType<typeof setTimeout> | undefined;
	#dragging = false;
	#el: any = null;

	get filename(): string {
		return this.#filename;
	}

	// ── selection tracking ─────────────────────────────────────────

	/** Watch a freshly rendered section document. Safe to call twice per doc. */
	observe(doc: Document) {
		if (this.#docs.has(doc)) return;
		const down = () => {
			this.#dragging = true;
			this.#hide();
		};
		const up = () => {
			this.#dragging = false;
			this.#schedule();
		};
		const changed = () => {
			const sel = doc.getSelection();
			if (!sel || sel.isCollapsed) this.#hide();
			else if (!this.#dragging) this.#schedule();
		};
		doc.addEventListener("pointerdown", down);
		doc.addEventListener("pointerup", up);
		doc.addEventListener("selectionchange", changed);
		// the anchor is a viewport position — a scrolled page invalidates it
		doc.addEventListener("scroll", this.#hide, { passive: true });
		this.#docs.set(doc, () => {
			doc.removeEventListener("pointerdown", down);
			doc.removeEventListener("pointerup", up);
			doc.removeEventListener("selectionchange", changed);
			doc.removeEventListener("scroll", this.#hide);
		});
	}

	#schedule() {
		clearTimeout(this.#settle);
		this.#settle = setTimeout(() => this.#publish(), SETTLE_MS);
	}

	// Assigns unconditionally: reading the fields here would make an `$effect`
	// that calls `dismiss()` depend on them and cancel every new selection.
	#hide = () => {
		clearTimeout(this.#settle);
		this.text = "";
		this.anchor = null;
	};

	/** Drop the pending selection (page turns leave a stale anchor behind). */
	dismiss() {
		this.#hide();
	}

	#publish() {
		for (const doc of this.#docs.keys()) {
			const sel = doc.getSelection();
			if (!sel || sel.isCollapsed || sel.rangeCount === 0) continue;
			const raw = normalize(sel.toString());
			if (raw.length < MIN_CHARS) continue;
			const range = sel.getRangeAt(0);
			// the first client rect is the start of the passage; the bounding box
			// would straddle the gutter in two-column mode
			const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
			this.tooLong = raw.length > REFUSE_CHARS;
			this.truncated = !this.tooLong && raw.length > MAX_CHARS;
			this.length = raw.length;
			this.text = trim(raw);
			this.anchor = toTopViewport(doc, rect);
			return;
		}
		this.#hide();
	}

	// ── card ───────────────────────────────────────────────────────

	/** Render the pending selection and open the preview. */
	async render(meta: QuoteMeta) {
		const text = this.text;
		if (!text) return;
		this.open = true;
		this.#reset();
		if (this.tooLong) return; // the panel shows the refusal instead
		this.busy = true;
		try {
			await loadQuoteImage();
			this.#el ??= document.body.appendChild(
				document.createElement("foliate-quoteimage"),
			);
			const blob: Blob | null = await this.#el.getBlob({
				title: meta.title,
				author: meta.author,
				text,
				theme: cardTheme(meta.theme),
			});
			if (!blob) throw new Error("the browser could not draw the card");
			this.#blob = blob;
			this.url = URL.createObjectURL(blob);
			this.#filename = `${slug(meta.title || "quote")}-quote.png`;
		} catch (e: any) {
			this.note = e?.message ?? String(e);
		} finally {
			this.busy = false;
		}
	}

	close() {
		this.open = false;
		this.#reset();
		this.#hide();
	}

	/** Clipboard where it works, download where it doesn't. */
	async copy() {
		const blob = this.#blob;
		if (!blob) return;
		const Item = (globalThis as any).ClipboardItem;
		if (navigator.clipboard?.write && Item) {
			try {
				await navigator.clipboard.write([new Item({ [blob.type]: blob })]);
				this.#flash("Copied to clipboard");
				return;
			} catch {
				// permission denied or image writes unsupported — save instead
			}
		}
		this.save();
		this.#flash("Clipboard unavailable — saved the image instead");
	}

	save() {
		if (!this.url) return;
		const a = document.createElement("a");
		a.href = this.url;
		a.download = this.#filename;
		a.click();
		this.#flash("Saved " + this.#filename);
	}

	dispose() {
		for (const off of this.#docs.values()) off();
		this.#docs.clear();
		clearTimeout(this.#settle);
		clearTimeout(this.#noteTimer);
		this.#reset();
		this.#el?.remove();
		this.#el = null;
	}

	#reset() {
		if (this.url) URL.revokeObjectURL(this.url);
		this.url = null;
		this.#blob = null;
		this.note = "";
	}

	#flash(msg: string) {
		this.note = msg;
		clearTimeout(this.#noteTimer);
		this.#noteTimer = setTimeout(() => (this.note = ""), 2600);
	}
}

/** Reader theme → card palette. Dark themes need a heavier edge shadow. */
function cardTheme(t: Theme) {
	const dark = t.scheme === "dark";
	return {
		bg: t.bg,
		fg: t.fg,
		dim: t.dim,
		vignette: dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.07)",
		grain: dark ? 0.16 : 0.28,
	};
}

/** Lift a rect out of its (possibly nested) iframe into page coordinates. */
function toTopViewport(doc: Document, rect: DOMRect | DOMRectReadOnly) {
	let x = rect.left + rect.width / 2;
	let y = rect.top;
	let win: Window | null = doc.defaultView;
	while (win && win !== window) {
		const frame = win.frameElement as HTMLElement | null;
		if (!frame) break;
		const box = frame.getBoundingClientRect();
		x += box.left;
		y += box.top;
		win = frame.ownerDocument.defaultView;
	}
	return { x, y };
}
