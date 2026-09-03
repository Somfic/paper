// The spoiler-safe half of the character tracker: it owns the cached index, the
// names found in the section on screen, and — the point of the whole feature —
// the boundary between what you have read and what you have not.
//
// The boundary is deliberately lopsided. Showing someone a mention from further
// on than they have read ruins the book; hiding a mention they read a paragraph
// ago costs them nothing. So every ambiguous case resolves to hiding:
//
//   * sections *before* the one on screen count as read (a reader who skipped
//     ahead has already chosen to see them);
//   * in the section on screen, a mention counts as read only when its range
//     ends before the start of the visible page, compared as DOM positions —
//     no offset arithmetic, so nothing to be off by;
//   * if the section on screen has not been matched yet, or foliate has not
//     told us where we are, that section contributes nothing at all;
//   * sections after the one on screen never contribute.

import { browser } from "$app/environment";
import * as library from "$lib/library";
import { notesKey } from "$lib/library";
import { flattenToc } from "./foliate";
import type { ReaderController } from "./reader.svelte";
import { scoreQuote } from "./characters-extract";
import type { SectionText } from "./characters-extract";
import type { ScanRequest, ScanResponse } from "./characters.worker";
import {
	buildMatcher,
	cleanQuote,
	findHits,
	flatOffset,
	flatRange,
	flattenSection,
	rangeViewportRect,
	sentences,
	INDEX_VERSION,
	isNotStory,
	MIN_CAST,
	type AliasMatcher,
	type CharacterIndex,
	type FlatText,
	type Hit,
	type Rect,
} from "./characters";

// Same URL as the reader's own script tag, so the browser reuses the module.
const VIEW_URL = "/foliate-js/view.js";

/** How long after a book opens the scan may start. Reading comes first. */
const SCAN_DELAY = 1500;

/** Most quotes to show as evidence for one character. */
const MAX_QUOTES = 3;

/** Live mentions to pull a fresh quote from — the most recent ones. */
const LIVE_QUOTE_WINDOW = 12;

/**
 * How long the pointer has to rest on a name before your note comes up. Long
 * enough that reading a line does not set off a bubble under the pointer,
 * short enough to feel like an answer rather than a delay.
 */
const HOVER_DELAY = 320;

export type CastMember = {
	entry: number;
	name: string;
	/** mentions *so far*, never the book's total */
	count: number;
	firstChapter: string;
};

export type CharacterEvidence = CastMember & {
	quotes: { text: string; chapter: string }[];
};

type Reveal = { count: number; first: number };

type LiveSection = {
	index: number;
	doc: Document;
	flat: FlatText;
	hits: Hit[];
	ranges: (Range | null | undefined)[];
};

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * An Overlayer draw function: a hairline dashed rule under the name. It has to
 * read as "there is something here" from the corner of your eye and no more —
 * this is a novel, not a wiki.
 */
function drawName(rects: Iterable<DOMRect>, options: { color?: string } = {}) {
	const g = document.createElementNS(SVG_NS, "g");
	g.setAttribute("fill", "none");
	g.setAttribute("stroke", options.color ?? "currentColor");
	g.setAttribute("stroke-width", "1");
	g.setAttribute("stroke-dasharray", "1.5 2.5");
	g.setAttribute("stroke-opacity", "0.6");
	for (const { left, right, bottom } of rects) {
		const path = document.createElementNS(SVG_NS, "path");
		path.setAttribute("d", `M${left} ${bottom - 0.5}H${right}`);
		g.append(path);
	}
	return g;
}

/** Where in the text a click landed. Chrome and Safari spell this differently. */
function caretPoint(
	doc: Document,
	x: number,
	y: number,
): { node: Node; offset: number } | null {
	const d = doc as any;
	const position = d.caretPositionFromPoint?.(x, y);
	if (position?.offsetNode)
		return { node: position.offsetNode, offset: position.offset };
	const range = d.caretRangeFromPoint?.(x, y);
	if (range) return { node: range.startContainer, offset: range.startOffset };
	return null;
}

/** The sentence containing `offset`, tidied for quoting. */
function sentenceAt(text: string, offset: number): string {
	for (const [from, to] of sentences(text))
		if (offset >= from && offset < to) return cleanQuote(text.slice(from, to));
	return "";
}

/**
 * Your notes on a book's cast, keyed by the character's name. The name rather
 * than its position in the index: the index is rebuilt whenever the heuristics
 * change, and a note has to survive that. Anything else in storage is ignored
 * — a bad value costs the notes, never the reader.
 */
function loadNotes(bookId: number): Record<string, string> {
	try {
		const raw = JSON.parse(localStorage.getItem(notesKey(bookId)) ?? "{}");
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
		const out: Record<string, string> = {};
		for (const [name, note] of Object.entries(raw))
			if (typeof note === "string" && note.trim()) out[name] = note;
		return out;
	} catch {
		return {};
	}
}

/** Book ids whose scan is already running, so a remount can't start a second. */
const scanning = new Set<number>();

export class CharacterController {
	// ── reactive state ─────────────────────────────────────────────
	index = $state<CharacterIndex | null>(null);
	/** the scan is running; the affordance stays hidden until it lands */
	building = $state(false);
	panelOpen = $state(false);
	popover = $state<{ entry: number; rect: Rect } | null>(null);
	/** Your own notes on the cast, by character name. */
	notes = $state<Record<string, string>>({});
	/** A name the pointer has rested on, and which you have written a note for. */
	hover = $state<{ entry: number; rect: Rect } | null>(null);

	// ── private refs ───────────────────────────────────────────────
	#reader: ReaderController | null = null;
	#matcher: AliasMatcher | null = null;
	#live: LiveSection | null = null;
	#pageStart: Range | null = null;
	/** live hits strictly before the visible page; the rest are unread */
	#cut = 0;
	#applied = new Set<string>();
	#appliedIndex = -1;
	#appliedColour = "";
	#bookId = 0;
	#hoverHit = -1;
	#hoverTimer = 0;
	// Ranges and the reading position aren't reactive values, so a counter
	// stands in for them: bumped on every relocate and every section match.
	#tick = $state(0);
	#section = $state(-1);
	#destroyed = false;

	// ── what the reader has met so far ─────────────────────────────

	/** Per entry: mentions read so far, and the section of the first of them. */
	reveal = $derived.by<Reveal[]>(() => {
		this.#tick;
		const index = this.index;
		const section = this.#section;
		if (!index) return [];
		const out: Reveal[] = index.entries.map((entry) => {
			// Mentions are in reading order, so everything before the first mention
			// in the current section is behind us.
			let lo = 0;
			let hi = entry.mentions.length;
			while (lo < hi) {
				const mid = (lo + hi) >> 1;
				if (entry.mentions[mid].i < section) lo = mid + 1;
				else hi = mid;
			}
			return { count: lo, first: lo > 0 ? entry.mentions[0].i : -1 };
		});
		const live = this.#live;
		if (live && live.index === section)
			for (let k = 0; k < this.#cut; k++) {
				const reveal = out[live.hits[k].entry];
				if (!reveal) continue;
				reveal.count++;
				if (reveal.first < 0) reveal.first = section;
			}
		return out;
	});

	/** Everyone met so far, most-mentioned first. */
	cast = $derived.by<CastMember[]>(() => {
		const index = this.index;
		if (!index) return [];
		const reveal = this.reveal;
		const out: CastMember[] = [];
		index.entries.forEach((entry, k) => {
			const seen = reveal[k];
			if (!seen || seen.count < 1) return;
			out.push({
				entry: k,
				name: entry.name,
				count: seen.count,
				firstChapter: this.#label(seen.first),
			});
		});
		return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
	});

	/** Whether there is a cast worth offering at all. */
	usable = $derived(!!this.index && this.index.entries.length >= MIN_CAST);

	/**
	 * Everything we can honestly say about a character: how often they have come
	 * up so far, where you first met them, and a few sentences you have already
	 * read them in. Nothing is summarised or invented — it is your own book,
	 * quoted back.
	 */
	evidence(k: number): CharacterEvidence | null {
		const index = this.index;
		const entry = index?.entries[k];
		const seen = this.reveal[k];
		if (!index || !entry || !seen || seen.count < 1) return null;

		type Quote = { i: number; o: number; text: string; score: number };
		const quotes: Quote[] = [];
		for (const mention of entry.mentions) {
			if (mention.i >= this.#section) break;
			if (mention.t) quotes.push({ i: mention.i, o: mention.o, text: mention.t, score: mention.q ?? 0 });
		}
		const live = this.#live;
		if (live && live.index === this.#section) {
			const from = Math.max(0, this.#cut - LIVE_QUOTE_WINDOW);
			for (let n = from; n < this.#cut; n++) {
				const hit = live.hits[n];
				if (hit.entry !== k) continue;
				const text = sentenceAt(live.flat.text, hit.from);
				if (text) quotes.push({ i: live.index, o: hit.from, text, score: scoreQuote(text, entry.name) });
			}
		}

		// The first sighting always earns its place; the rest go on how much they
		// actually describe the person rather than just attributing speech.
		quotes.sort((a, b) => a.i - b.i || a.o - b.o);
		const picked: Quote[] = [];
		if (quotes.length) picked.push(quotes[0]);
		for (const quote of [...quotes.slice(1)].sort((a, b) => b.score - a.score)) {
			if (picked.length >= MAX_QUOTES) break;
			if (picked.some((p) => p.text === quote.text)) continue;
			picked.push(quote);
		}
		picked.sort((a, b) => a.i - b.i || a.o - b.o);

		return {
			entry: k,
			name: entry.name,
			count: seen.count,
			firstChapter: this.#label(seen.first),
			quotes: picked.map((q) => ({ text: q.text, chapter: this.#label(q.i) })),
		};
	}

	#label(section: number): string {
		if (section < 0) return "";
		const labels = this.index?.labels ?? [];
		for (let i = section; i >= 0; i--) if (labels[i]) return labels[i] as string;
		return "";
	}

	// ── lifecycle ──────────────────────────────────────────────────

	/** Watch `reader` while it has `bookId` open. Returns a teardown. */
	attach(reader: ReaderController, bookId: number): () => void {
		this.#reader = reader;
		this.#bookId = bookId;
		this.#destroyed = false;
		this.notes = loadNotes(bookId);
		const offSection = reader.onSection((doc, index) => this.#matched(doc, index));
		const view = reader.view;
		view?.addEventListener("relocate", this.#onRelocate);
		// A section may already be on screen: `load` fired while the book was
		// still opening, before anything could subscribe.
		const current = view?.renderer?.getContents?.()?.[0];
		if (current?.doc) this.#matched(current.doc, current.index ?? -1);

		this.#load(bookId);

		return () => {
			this.#destroyed = true;
			offSection();
			view?.removeEventListener("relocate", this.#onRelocate);
			this.#detachSection();
			this.#reader = null;
			this.index = null;
			this.#matcher = null;
			this.popover = null;
			this.panelOpen = false;
			this.notes = {};
			this.#section = -1;
		};
	}

	// ── your own notes ─────────────────────────────────────────────

	/** What you wrote about this character, if anything. */
	note = (name: string): string => this.notes[name] ?? "";

	/**
	 * Write a note. An empty one is removed rather than stored blank, so
	 * "has a note" stays a question with one answer — it decides whether the
	 * name shows a mark, and whether resting on it says anything.
	 */
	setNote = (name: string, text: string) => {
		const note = text.trim();
		const next = { ...this.notes };
		if (note) next[name] = note;
		else delete next[name];
		this.notes = next;
		try {
			localStorage.setItem(notesKey(this.#bookId), JSON.stringify(next));
		} catch {
			// A full or blocked store loses the note, not the reader's place.
		}
	};

	// ── the index ──────────────────────────────────────────────────

	async #load(bookId: number) {
		try {
			const cached = await library.characters(bookId);
			if (this.#destroyed) return;
			if (cached?.version === INDEX_VERSION) {
				this.#use(cached);
				return;
			}
		} catch (e) {
			console.warn("paper: could not read the cached cast", e);
		}
		// Never on the critical path of opening a book: the scan parses every
		// section again, so it waits until the first page is long since drawn.
		setTimeout(() => {
			if (!this.#destroyed) this.#scan(bookId);
		}, SCAN_DELAY);
	}

	#use(index: CharacterIndex) {
		this.index = index;
		this.#matcher = buildMatcher(index.entries);
		// The section on screen was matched against nothing; do it again, and
		// catch up on the position foliate has already reported.
		const live = this.#live;
		if (live) this.#matched(live.doc, live.index);
		this.#cut = this.#computeCut();
		this.#tick++;
		this.#decorate();
	}

	/**
	 * Parse the book a second time — foliate's own parser, one section at a
	 * time, exactly as `library/ingest` does — flatten each section to text on
	 * this thread (a worker has no DOMParser), and let the worker do the regex
	 * work. Yields between sections so the reader stays live throughout.
	 */
	async #scan(bookId: number) {
		if (!browser || scanning.has(bookId)) return;
		scanning.add(bookId);
		this.building = true;
		let worker: Worker | null = null;
		try {
			const file = await library.file(bookId);
			const { makeBook } = await import(/* @vite-ignore */ VIEW_URL);
			const book = await makeBook(file);
			const labels = await sectionLabels(book);

			worker = new Worker(new URL("./characters.worker.ts", import.meta.url), {
				type: "module",
			});
			const done = new Promise<CharacterIndex>((resolve, reject) => {
				worker!.onmessage = (e: MessageEvent<ScanResponse>) =>
					e.data.kind === "done"
						? resolve(e.data.index)
						: reject(new Error(e.data.message));
				worker!.onerror = (e) => reject(new Error(e.message || "scan failed"));
			});

			const sections: any[] = book?.sections ?? [];
			for (let i = 0; i < sections.length; i++) {
				if (this.#destroyed) return;
				const section = sections[i];
				// EPUB keeps the raw spine attribute, so non-linear reads "no".
				if (section?.linear === false || section?.linear === "no") continue;
				try {
					const doc = await section.createDocument?.();
					// The colophon and the licence page are prose full of capitalised
					// phrases, and they are not the story; see isNotStory.
					if (doc && !isNotStory(doc)) {
						const flat = flattenSection(doc);
						const payload: SectionText = {
							index: i,
							text: flat.text,
							headings: flat.headings,
						};
						worker.postMessage({ kind: "section", section: payload } satisfies ScanRequest);
					}
				} catch {
					// A section that won't parse costs us its names, not the book's.
				}
				section.unload?.();
				await new Promise((r) => setTimeout(r, 0));
			}

			const author = this.#reader?.book?.author ?? this.#reader?.metaAuthor ?? "";
			worker.postMessage({
				kind: "build",
				labels,
				exclude: author.split(/[\s,]+/).filter(Boolean),
				language: languageTag(book?.metadata?.language),
			} satisfies ScanRequest);

			const index = await done;
			book?.destroy?.();
			if (this.#destroyed) return;
			this.#use(index);
			try {
				await library.putCharacters(bookId, index);
			} catch (e) {
				console.warn("paper: could not cache the cast", e);
			}
		} catch (e) {
			console.warn("paper: character scan failed", e);
		} finally {
			worker?.terminate();
			scanning.delete(bookId);
			this.building = false;
		}
	}

	// ── the section on screen ──────────────────────────────────────

	#matched(doc: Document, index: number) {
		this.#detachSection();
		const matcher = this.#matcher;
		const flat = flattenSection(doc);
		const hits = matcher ? findHits(flat, matcher) : [];
		this.#live = { index, doc, flat, hits, ranges: new Array(hits.length) };
		this.#section = index;
		this.#cut = 0; // nothing is read until foliate says where we are
		doc.addEventListener("click", this.#onClick);
		doc.addEventListener("mousemove", this.#onMove, { passive: true });
		doc.addEventListener("mouseleave", this.#onLeave);
		this.#tick++;
	}

	#detachSection() {
		const live = this.#live;
		if (!live) return;
		live.doc.removeEventListener("click", this.#onClick);
		live.doc.removeEventListener("mousemove", this.#onMove);
		live.doc.removeEventListener("mouseleave", this.#onLeave);
		this.#hovered(-1);
		this.#live = null;
		this.#applied.clear();
		this.#appliedIndex = -1;
	}

	#onRelocate = (e: any) => {
		this.popover = null;
		this.#hovered(-1);
		const view = this.#reader?.view;
		const content = view?.renderer?.getContents?.()?.[0];
		// The section can change without a `load` (foliate reuses a rendered
		// document when you page back into it), so re-sync from the renderer.
		if (content?.doc && content.doc !== this.#live?.doc)
			this.#matched(content.doc, content.index ?? -1);

		this.#pageStart = (e?.detail?.range as Range) ?? null;
		this.#cut = this.#computeCut();
		this.#tick++;
		this.#decorate();
	};

	/**
	 * How many of this section's mentions are behind the visible page. Hits are
	 * in reading order and foliate's `range` is the visible page, so one binary
	 * search over DOM positions settles it — and a mention that is *on* the
	 * page counts as unread, which is the safe direction.
	 */
	#computeCut(): number {
		const live = this.#live;
		const page = this.#pageStart;
		if (!live || !page) return 0;
		const before = (k: number) => {
			const range = this.#rangeAt(k);
			if (!range) return false;
			try {
				return page.comparePoint(range.endContainer, range.endOffset) < 0;
			} catch {
				return false;
			}
		};
		let lo = 0;
		let hi = live.hits.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (before(mid)) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	#rangeAt(k: number): Range | null {
		const live = this.#live;
		if (!live) return null;
		if (live.ranges[k] === undefined)
			live.ranges[k] = flatRange(live.flat, live.hits[k].from, live.hits[k].to);
		return live.ranges[k] ?? null;
	}

	// ── decoration ─────────────────────────────────────────────────

	/**
	 * Underline the names of people already met, wherever they appear in this
	 * section. Drawn with foliate's Overlayer, which paints above the text: the
	 * section's DOM is never touched, so CFIs and text selection — which the
	 * quote cards live on — are exactly as they were.
	 */
	#decorate() {
		const live = this.#live;
		const view = this.#reader?.view;
		if (!live || !view) return;
		const content = view.renderer
			?.getContents?.()
			?.find((c: any) => c.index === live.index);
		const overlayer = content?.overlayer;
		if (!overlayer) return;
		const reveal = this.reveal;
		const color = this.#reader?.theme.link ?? "currentColor";
		if (this.#appliedIndex !== live.index) {
			// A different section: its overlayer went with it, nothing to remove.
			this.#applied.clear();
			this.#appliedIndex = live.index;
		} else if (this.#appliedColour !== color) {
			// The theme changed under a section that is already underlined. The
			// colour is baked into each mark when it is drawn, so they have to come
			// off and go back on — otherwise the cast stays underlined in the old
			// theme's link colour until you turn the page.
			for (const key of this.#applied) overlayer.remove(key);
			this.#applied.clear();
		}
		this.#appliedColour = color;

		const want = new Set<string>();
		live.hits.forEach((hit, k) => {
			if ((reveal[hit.entry]?.count ?? 0) > 0) want.add(String(k));
		});
		for (const key of [...this.#applied])
			if (!want.has(key)) {
				overlayer.remove(key);
				this.#applied.delete(key);
			}
		for (const key of want) {
			if (this.#applied.has(key)) continue;
			const range = this.#rangeAt(Number(key));
			if (!range) continue;
			overlayer.add(key, range, drawName, { color });
			this.#applied.add(key);
		}
	}

	// ── tapping a name ─────────────────────────────────────────────

	#hitAt(offset: number): number {
		const hits = this.#live?.hits ?? [];
		let lo = 0;
		let hi = hits.length - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if (offset < hits[mid].from) hi = mid - 1;
			else if (offset >= hits[mid].to) lo = mid + 1;
			else return mid;
		}
		return -1;
	}

	#onClick = (e: MouseEvent) => {
		const live = this.#live;
		if (!live || e.button !== 0) return;
		const target = e.target as Element | null;
		// Links belong to foliate (and to the footnote popover); a live selection
		// belongs to the quote cards. Neither is ours to take.
		if (target?.closest?.("a[href]")) return;
		if (!live.doc.getSelection()?.isCollapsed) return;

		const point = caretPoint(live.doc, e.clientX, e.clientY);
		if (!point) return;
		const offset = flatOffset(live.flat, point.node, point.offset);
		if (offset < 0) return;
		const k = this.#hitAt(offset);
		if (k < 0) {
			// A click in the prose is the reader going back to reading.
			this.popover = null;
			return;
		}
		const hit = live.hits[k];
		// Not met yet — the name in front of them is all they know, and this
		// popover would be the first thing to say more than the book has.
		if ((this.reveal[hit.entry]?.count ?? 0) < 1) return;
		const range = this.#rangeAt(k);
		if (!range) return;
		this.panelOpen = false;
		this.#hovered(-1);
		this.popover = { entry: hit.entry, rect: rangeViewportRect(range) };
	};

	// A pointer cursor is the only hint that a name is tappable; the underline
	// alone reads as emphasis. Throttled to a frame — this runs on mousemove.
	#moveRaf = 0;
	#onMove = (e: MouseEvent) => {
		const live = this.#live;
		if (!live || this.#moveRaf) return;
		const { clientX, clientY } = e;
		this.#moveRaf = requestAnimationFrame(() => {
			this.#moveRaf = 0;
			// Dragging out a quote is not hovering. Stay out of the way of it.
			if (!live.doc.getSelection()?.isCollapsed) {
				this.#hovered(-1);
				return;
			}
			const point = caretPoint(live.doc, clientX, clientY);
			const offset = point ? flatOffset(live.flat, point.node, point.offset) : -1;
			const k = offset < 0 ? -1 : this.#hitAt(offset);
			const met =
				k >= 0 && (this.reveal[live.hits[k].entry]?.count ?? 0) > 0;
			live.doc.body.style.cursor = met ? "pointer" : "";
			this.#hovered(met ? k : -1);
		});
	};

	#onLeave = () => this.#hovered(-1);

	/**
	 * Rest the pointer on someone you have written a note about and the note
	 * comes up. Only a note: everything the book itself says is a click away in
	 * the card, and putting that under the pointer would mean a paragraph
	 * jumping out at you every time you read across a name.
	 */
	#hovered(k: number) {
		if (k === this.#hoverHit) return;
		this.#hoverHit = k;
		clearTimeout(this.#hoverTimer);
		this.hover = null;

		const live = this.#live;
		if (k < 0 || !live || this.popover) return;
		const entry = live.hits[k].entry;
		if (!this.note(this.index?.entries[entry]?.name ?? "")) return;
		const range = this.#rangeAt(k);
		if (!range) return;
		const rect = rangeViewportRect(range);
		this.#hoverTimer = window.setTimeout(() => {
			this.hover = { entry, rect };
		}, HOVER_DELAY);
	}

	// ── dismissal ──────────────────────────────────────────────────

	// Clicking away and pressing Escape are glow's to handle: both layers are
	// its popovers now, and it already peels them one at a time. The one case
	// it cannot see is a click inside the book itself, which happens in
	// foliate's iframe and never reaches this document — `#onClick` closes the
	// card for that one.
	dismiss = () => {
		this.popover = null;
	};
}

/** `dc:language`, which an epub may give as a string or a list of them. */
function languageTag(value: unknown): string | undefined {
	const first = Array.isArray(value) ? value[0] : value;
	return typeof first === "string" && first ? first : undefined;
}

/**
 * Chapter label per section index, so a character's first appearance has a
 * place. The TOC only names the sections it points at; the rest inherit the
 * label above them, which is what "first met in" means to a reader.
 */
async function sectionLabels(book: any): Promise<(string | undefined)[]> {
	const labels: (string | undefined)[] = [];
	for (const item of flattenToc(book?.toc ?? [])) {
		try {
			const resolved = await book?.resolveHref?.(item.href);
			const index = resolved?.index;
			if (typeof index === "number" && !labels[index]) labels[index] = item.label;
		} catch {
			// A TOC entry we can't resolve just leaves its section unlabelled.
		}
	}
	let last: string | undefined;
	for (let i = 0; i < (book?.sections?.length ?? 0); i++) {
		if (labels[i]) last = labels[i];
		else labels[i] = last;
	}
	return labels;
}
