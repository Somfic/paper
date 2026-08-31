import { foldsKey } from "$lib/library";

const SNIPPET_MAX = 90;

/** A dog-eared page. */
export type Fold = {
	/**
	 * CFI of the first visible text position on the folded page. A page *index*
	 * would drift the moment the font size, column count or flow changes; a CFI
	 * points at the text itself, so the fold stays on the passage it marked.
	 */
	cfi: string;
	/** Chapter label when the fold was made — the row's title in the menu. */
	label: string;
	/** A few words from the fold, so the reader recognises the place. */
	snippet: string;
};

// epubcfi.js lives in /static, which vite refuses to bundle — import it from
// its URL at runtime, the same deal as loadFoliate() and the footnote handler.
const CFI_URL = "/foliate-js/epubcfi.js";
let cfiModule: Promise<any> | null = null;
const loadCFI = (): Promise<any> =>
	(cfiModule ??= import(/* @vite-ignore */ CFI_URL));

/** Tolerate anything in storage: a bad value costs the folds, never the reader. */
function loadFolds(bookId: number): Fold[] {
	try {
		const raw = JSON.parse(localStorage.getItem(foldsKey(bookId)) ?? "[]");
		if (!Array.isArray(raw)) return [];
		return raw
			.filter((f) => f && typeof f.cfi === "string")
			.map((f) => ({
				cfi: f.cfi as string,
				label: typeof f.label === "string" ? f.label : "",
				snippet: typeof f.snippet === "string" ? f.snippet : "",
			}));
	} catch {
		return [];
	}
}

/** The page's text, trimmed to a recognisable phrase on a word boundary. */
function snippetOf(range: Range | null | undefined): string {
	let text = (range?.toString() ?? "").replace(/\s+/g, " ").trim();
	// A page can begin mid-word, so the range's first characters are the tail of
	// a word broken over the page turn. Drop it rather than open on a fragment.
	const before = range?.startContainer?.nodeValue?.[range.startOffset - 1];
	if (before && !/\s/.test(before)) text = text.replace(/^\S+\s*/, "");
	if (text.length <= SNIPPET_MAX) return text;
	const cut = text.slice(0, SNIPPET_MAX);
	const space = cut.lastIndexOf(" ");
	return (space > SNIPPET_MAX * 0.6 ? cut.slice(0, space) : cut) + "…";
}

/**
 * Dog-ears: fold a page's corner to mark your place. Folds are anchored to
 * CFIs and live in localStorage next to the reading position, so a handful of
 * them per book costs nothing and survives a reload.
 *
 * The controller keeps no DOM of its own — `DogEar.svelte` draws the corner and
 * `ChapterMenu.svelte` lists the folds; both read the reactive fields below.
 */
export class FoldController {
	// ── reactive state ─────────────────────────────────────────────
	list = $state<Fold[]>([]);
	/** CFIs this file can't resolve — kept, listed, but honest about it. */
	broken = $state<string[]>([]);

	// ── private engine refs ────────────────────────────────────────
	#view: any = null;
	#bookId = 0;
	#cfi = $state<any>(null); // epubcfi.js, once it lands
	// The visible range of the page in view, as of the last `relocate`. Foliate
	// reports it as a range CFI, whose start is exactly the anchor we want.
	#pageCfi = $state("");
	#pageRange: Range | null = null;
	#pageLabel = "";
	#validated = false;

	/** Folds anchored inside the page in view. */
	onPage = $derived.by<Fold[]>(() => {
		const mod = this.#cfi;
		const page = this.#pageCfi;
		if (!mod || !page) return [];
		let start: string, end: string;
		try {
			start = mod.collapse(page);
			end = mod.collapse(page, true);
		} catch {
			return [];
		}
		return this.list.filter((f) => {
			try {
				return mod.compare(start, f.cfi) <= 0 && mod.compare(f.cfi, end) <= 0;
			} catch {
				return false;
			}
		});
	});

	folded = $derived(this.onPage.length > 0);
	/** Nothing to fold until foliate has placed us and epubcfi has loaded. */
	available = $derived(!!this.#pageCfi && !!this.#cfi);

	// ── wiring ─────────────────────────────────────────────────────
	attach(view: any, bookId: number) {
		this.#view = view;
		this.#bookId = bookId;
		this.#validated = false;
		this.broken = [];
		this.list = loadFolds(bookId);
		loadCFI()
			.then((m) => {
				this.#cfi = m;
				this.list = this.#sorted(this.list);
			})
			.catch((e) => console.warn("folds unavailable", e));
		view.addEventListener("relocate", this.#onRelocate);
	}

	detach() {
		this.#view?.removeEventListener?.("relocate", this.#onRelocate);
		this.#view = null;
		this.#pageCfi = "";
		this.#pageRange = null;
	}

	#onRelocate = (e: any) => {
		this.#pageCfi = e.detail?.cfi ?? "";
		this.#pageRange = e.detail?.range ?? null;
		this.#pageLabel = e.detail?.tocItem?.label ?? this.#pageLabel;
		// The book is parsed by the first relocate, so this is the earliest point
		// a stored CFI can be checked against the file that's actually open.
		if (!this.#validated) {
			this.#validated = true;
			this.broken = this.list.filter((f) => !this.#resolves(f.cfi)).map((f) => f.cfi);
		}
	};

	// ── folding ────────────────────────────────────────────────────
	toggle = () => {
		const here = this.onPage;
		if (here.length) this.#write(this.list.filter((f) => !here.includes(f)));
		else this.#fold();
	};

	#fold() {
		const mod = this.#cfi;
		if (!mod || !this.#pageCfi) return;
		let cfi = this.#pageCfi;
		try {
			cfi = mod.collapse(this.#pageCfi); // the page's first text position
		} catch {}
		const fold: Fold = {
			cfi,
			label: this.#pageLabel,
			snippet: snippetOf(this.#pageRange),
		};
		this.#write([...this.list.filter((f) => f.cfi !== cfi), fold]);
	}

	remove = (fold: Fold) => {
		this.#write(this.list.filter((f) => f.cfi !== fold.cfi));
	};

	isBroken = (fold: Fold) => this.broken.includes(fold.cfi);

	/** Go to a fold, marking it broken if this file can't place it after all. */
	goTo = async (fold: Fold) => {
		try {
			if (await this.#view?.goTo?.(fold.cfi)) return;
		} catch {}
		if (!this.broken.includes(fold.cfi))
			this.broken = [...this.broken, fold.cfi];
	};

	// ── storage ────────────────────────────────────────────────────
	#write(list: Fold[]) {
		this.list = this.#sorted(list);
		try {
			localStorage.setItem(foldsKey(this.#bookId), JSON.stringify(this.list));
		} catch {}
	}

	/** Reading order, so the menu lists folds the way the book runs. */
	#sorted(list: Fold[]): Fold[] {
		const mod = this.#cfi;
		if (!mod) return list;
		return [...list].sort((a, b) => {
			try {
				return mod.compare(a.cfi, b.cfi);
			} catch {
				return 0;
			}
		});
	}

	// Cheap up-front check: does the CFI still name a section this file has?
	// A path that has since moved *inside* its section only shows up on goTo.
	#resolves(cfi: string): boolean {
		try {
			const { index } = this.#view?.resolveCFI?.(cfi) ?? {};
			return typeof index === "number" && !!this.#view?.book?.sections?.[index];
		} catch {
			return false;
		}
	}
}
