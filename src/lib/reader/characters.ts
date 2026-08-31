// Types and pure helpers shared by the offline character scan (which runs in a
// worker, so nothing here may touch the DOM at module scope) and the reader
// runtime that matches the scan's names back onto a rendered section.
//
// The unit of position is a *flat offset*: sections are flattened to one string
// by concatenating their text nodes in document order, and a mention is
// remembered as (section index, offset into that string). Offline that is all we
// can honestly produce — building CFIs without a renderer is guesswork — and it
// is enough, because the spoiler boundary in the section being read is decided
// by comparing DOM ranges, not offsets. See `CharacterController`.

/** Bumped when the extraction heuristics change, which invalidates the cache. */
export const INDEX_VERSION = 1;

/** Below this a section is a title page or a dedication, not story. */
export const MIN_SECTION_WORDS = 250;

/** Fewer characters than this and there is no cast worth showing. */
export const MIN_CAST = 3;

export type CharacterMention = {
	/** spine section index */
	i: number;
	/** flat offset of the mention's first character within that section */
	o: number;
	/** the sentence it appeared in — kept only for mentions worth quoting */
	t?: string;
	/** how descriptive `t` reads; higher is better evidence */
	q?: number;
};

export type CharacterEntry = {
	/** what we show the reader: "Inquisitor Glokta", "Logen Ninefingers" */
	name: string;
	/** every surface form that resolves to this person, longest first */
	aliases: string[];
	/** mentions in the whole book, in reading order */
	mentions: CharacterMention[];
};

export type CharacterIndex = {
	version: number;
	built_at: string;
	/** chapter label per scanned section index, for "first met in" */
	labels: (string | undefined)[];
	entries: CharacterEntry[];
};

// ── flattening a section ───────────────────────────────────────

/**
 * Synthetic block boundary in a flat text. It cannot be "\n": epubs produced by
 * converters hard-wrap their source, so real newlines turn up in the middle of
 * paragraphs and would split every other sentence. U+2029 never appears in book
 * text, and counts as whitespace everywhere else.
 */
export const BLOCK_SEP = "\u2029";

export type FlatText = {
	/** every text node's value, concatenated, with U+2029 at block edges */
	text: string;
	nodes: Text[];
	/** `nodes[k]`'s value starts at `starts[k]` in `text` */
	starts: number[];
	/** [start, end) spans that came from headings — never matched against */
	headings: [number, number][];
};

// Same rejection list as foliate's text-walker, which is the flattening this
// mirrors; `svg` is added because its text is decoration, never prose.
const SKIP = new Set(["script", "style", "noscript", "template", "svg", "head"]);

// Block elements get a separator at each edge. foliate's text-walker doesn't do
// this — it has no need to — but without it `<h2>One</h2><p>Logen woke.</p>`
// flattens to "OneLogen woke." and every sentence and name at a paragraph seam
// is wrong. Offsets therefore only ever compare against our own flattening.
const BLOCK = new Set([
	"address", "article", "aside", "blockquote", "br", "caption", "dd", "div",
	"dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2",
	"h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre",
	"section", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);

const HEADING = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "title"]);

const OPS_NS = "http://www.idpf.org/2007/ops";

/** Chapter numbers, running heads and page markers: prose-shaped, but not prose. */
function isHeadingLike(el: Element): boolean {
	const tag = el.localName?.toLowerCase() ?? "";
	if (HEADING.has(tag)) return true;
	const type = el.getAttributeNS(OPS_NS, "type") ?? "";
	if (/\b(title|subtitle|halftitle|fulltitle|bridgehead|pagebreak)\b/.test(type))
		return true;
	const role = el.getAttribute("role") ?? "";
	return /\bdoc-(subtitle|pagebreak)\b/.test(role);
}

/**
 * Flatten a section document to one string plus the text nodes behind it, so a
 * matcher can work on plain text and map hits back to DOM ranges. Used for both
 * the offline scan and the rendered page, and it has to agree with itself in
 * both — the whole offset space depends on it.
 */
export function flattenSection(doc: Document): FlatText {
	const nodes: Text[] = [];
	const starts: number[] = [];
	const headings: [number, number][] = [];
	let text = "";

	const brk = () => {
		if (text && !text.endsWith(BLOCK_SEP)) text += BLOCK_SEP;
	};

	const walk = (el: Element) => {
		if (SKIP.has(el.localName?.toLowerCase() ?? "")) return;
		const block = BLOCK.has(el.localName?.toLowerCase() ?? "");
		if (block) brk();
		const heading = isHeadingLike(el);
		const from = text.length;
		for (const child of Array.from(el.childNodes)) {
			if (child.nodeType === 1) walk(child as Element);
			else if (child.nodeType === 3 || child.nodeType === 4) {
				const value = child.nodeValue ?? "";
				if (!value) continue;
				nodes.push(child as Text);
				starts.push(text.length);
				text += value;
			}
		}
		if (heading && text.length > from) headings.push([from, text.length]);
		if (block) brk();
	};

	if (doc.body) walk(doc.body);
	return { text, nodes, starts, headings };
}

/** Index of the text node holding `offset`, or -1. */
function nodeAt(flat: FlatText, offset: number): number {
	let lo = 0;
	let hi = flat.starts.length - 1;
	let found = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (flat.starts[mid] <= offset) {
			found = mid;
			lo = mid + 1;
		} else hi = mid - 1;
	}
	if (found < 0) return -1;
	// A block separator is synthetic and belongs to no node; the offset can land
	// past the end of the node we found, in which case there is nothing there.
	const end = flat.starts[found] + (flat.nodes[found].nodeValue?.length ?? 0);
	return offset < end ? found : -1;
}

/** A DOM range over `[from, to)` of the flat text, or null if it doesn't map. */
export function flatRange(flat: FlatText, from: number, to: number): Range | null {
	const a = nodeAt(flat, from);
	const b = nodeAt(flat, Math.max(from, to - 1));
	if (a < 0 || b < 0) return null;
	const doc = flat.nodes[a].ownerDocument;
	if (!doc) return null;
	const range = doc.createRange();
	range.setStart(flat.nodes[a], from - flat.starts[a]);
	range.setEnd(flat.nodes[b], to - flat.starts[b]);
	return range;
}

/** Flat offset of a DOM point, or -1 when the node isn't part of the text. */
export function flatOffset(flat: FlatText, node: Node, offset: number): number {
	const k = flat.nodes.indexOf(node as Text);
	if (k < 0) return -1;
	return flat.starts[k] + offset;
}

// ── sentences ──────────────────────────────────────────────────

// Abbreviations whose full stop doesn't end a sentence. Not exhaustive; a miss
// only splits one quote in the wrong place.
const ABBREV = new Set([
	"mr", "mrs", "ms", "dr", "st", "prof", "sr", "jr", "lt", "col", "capt",
	"sgt", "gen", "rev", "hon", "vs", "no", "fig", "etc", "viz", "messrs",
	"mme", "mlle", "esq", "inc", "ltd",
]);

const TERMINATORS = ".!?…";
const CLOSERS = "\"'”’)]»›";

function isAbbrev(text: string, dot: number): boolean {
	let i = dot - 1;
	while (i >= 0 && /[\p{L}]/u.test(text[i])) i--;
	const word = text.slice(i + 1, dot);
	if (!word) return false;
	// a lone capital is an initial ("J. Abercrombie"), not a sentence end
	if (word.length === 1 && word === word.toUpperCase()) return true;
	return ABBREV.has(word.toLowerCase());
}

/**
 * Sentence spans over a flat section text. Block edges are hard boundaries,
 * which is what keeps headings and paragraph seams out of quotes.
 */
export function* sentences(text: string): Generator<[number, number]> {
	const n = text.length;
	let start = 0;
	for (let i = 0; i < n; i++) {
		const c = text[i];
		if (c === BLOCK_SEP) {
			if (i > start) yield [start, i];
			start = i + 1;
			continue;
		}
		if (!TERMINATORS.includes(c)) continue;
		let j = i + 1;
		while (j < n && TERMINATORS.includes(text[j])) j++;
		while (j < n && CLOSERS.includes(text[j])) j++;
		// A terminator only ends a sentence when whitespace or the text follows;
		// "3.5" and "e.g" stay whole.
		if (j < n && !/\s/.test(text[j])) {
			i = j - 1;
			continue;
		}
		if (c === "." && isAbbrev(text, i)) {
			i = j - 1;
			continue;
		}
		if (j > start) yield [start, j];
		while (j < n && /\s/.test(text[j])) j++;
		start = j;
		i = start - 1;
	}
	if (start < n) yield [start, n];
}

/** Tidy a sentence for display: no newlines, no runs of whitespace. */
export function cleanQuote(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

// ── matching known names in a rendered section ─────────────────

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Names can be separated by any run of whitespace once rendered. */
const aliasPattern = (alias: string) =>
	alias.split(/\s+/).map(escapeRe).join("[\\s\\u00a0]+");

export type AliasMatcher = {
	re: RegExp;
	/** normalised match text → index into the entry list */
	owner: Map<string, number>;
};

/**
 * One alternation over every alias, longest first so "Logen Ninefingers" wins
 * over "Logen". Aliases are assigned to exactly one entry by the scan, so a hit
 * is never ambiguous.
 */
export function buildMatcher(entries: CharacterEntry[]): AliasMatcher | null {
	const owner = new Map<string, number>();
	const all: string[] = [];
	entries.forEach((entry, idx) => {
		for (const alias of entry.aliases) {
			const key = alias.replace(/\s+/g, " ");
			if (owner.has(key)) continue;
			owner.set(key, idx);
			all.push(alias);
		}
	});
	if (!all.length) return null;
	all.sort((a, b) => b.length - a.length);
	return {
		re: new RegExp(all.map(aliasPattern).join("|"), "gu"),
		owner,
	};
}

const isLetter = (c: string | undefined) => !!c && /[\p{L}\p{M}]/u.test(c);

export type Hit = { entry: number; from: number; to: number };

/**
 * Every alias occurrence in a flat text, in reading order. Heading spans are
 * skipped: a name in a running head is a printing artefact, not a mention.
 */
export function findHits(
	flat: FlatText,
	matcher: AliasMatcher,
): Hit[] {
	const hits: Hit[] = [];
	const inHeading = (at: number) =>
		flat.headings.some(([a, b]) => at >= a && at < b);
	matcher.re.lastIndex = 0;
	for (let m = matcher.re.exec(flat.text); m; m = matcher.re.exec(flat.text)) {
		const from = m.index;
		const to = from + m[0].length;
		// Reject a hit that is only part of a longer word ("Logendorf").
		if (isLetter(flat.text[from - 1]) || isLetter(flat.text[to])) continue;
		if (inHeading(from)) continue;
		const entry = matcher.owner.get(m[0].replace(/\s+/g, " "));
		if (entry === undefined) continue;
		hits.push({ entry, from, to });
	}
	return hits;
}

// ── geometry ───────────────────────────────────────────────────

export type Rect = { left: number; right: number; top: number; bottom: number };

/**
 * A range's rect in the *top* document's coordinates. Sections render inside
 * foliate's nested iframes, so every frame's offset has to be folded in. Mirrors
 * `viewportRect` in reader/footnotes for the same reason.
 */
export function rangeViewportRect(range: Range): Rect {
	const r = range.getBoundingClientRect();
	const out = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
	let win: Window | null = range.startContainer.ownerDocument?.defaultView ?? null;
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
