// A shelf seen from the side. Two questions decide how a book looks standing
// up: how thick it is, which is its word count, and what colour its spine is,
// which is the leftmost strip of its cover — the way a wrap-around jacket
// carries the front's artwork around the hinge. Both answers are cached: a
// book's length and jacket don't change, and sampling one costs an image decode.

import * as library from "$lib/library";
import type { Book } from "$lib/library";
import { bandColour, lookupCover } from "$lib/library/covers";

/** A painted spine: a gradient down its length, plus one colour standing for it. */
export type SpineArt = {
	/** Samples of the cover's left edge, top to bottom — one gradient stop each. */
	bands: string[];
	/** The spine read as a single colour; hue order and ink contrast come off it. */
	accent: string;
	/** Whether the bands came off a real jacket or out of the title hash. */
	source: "cover" | "title";
};

// ── thickness ──────────────────────────────────────────────────

const MIN_PX = 26; // a title still reads at this width, and it's still a target
const MAX_PX = 78;
/** Not ingested yet, or ingest failed: an unremarkable mid-list thickness. */
const UNKNOWN_PX = 34;
const NOVELLA_WORDS = 30_000;
const NOVELLA_PX = 27;
/**
 * A real spine is linear in leaves, so a 400k omnibus is thirteen times a 30k
 * novella — at a width where the novella's title is still legible that puts the
 * omnibus past 300px, which is a wall, not a book. Compressing the range with a
 * 0.4 exponent keeps the two obviously different (27px against 76px) while both
 * stay on the same shelf.
 */
const COMPRESSION = 0.4;

export function spineWidth(book: Book): number {
	const words = book.word_count ?? 0;
	if (words <= 0) return UNKNOWN_PX;
	const px = NOVELLA_PX * (words / NOVELLA_WORDS) ** COMPRESSION;
	return Math.round(Math.min(MAX_PX, Math.max(MIN_PX, px)));
}

// Pocket editions, trade paperbacks and hardbacks aren't the same height, and a
// shelf where every top edge lines up reads as a bar chart rather than as books.
const HEIGHTS = [174, 183, 191, 199, 207];

/** The tallest book, so every shelf row can be the same height. */
export const BOOK_HEIGHT = HEIGHTS[HEIGHTS.length - 1];

export function spineHeight(book: Book): number {
	return HEIGHTS[hash(book.title) % HEIGHTS.length];
}

/** FNV-1a — a book's height and fallback colour have to survive a reload. */
function hash(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

// ── colour ─────────────────────────────────────────────────────

type Rgb = [number, number, number];

const byte = (v: number) =>
	Math.round(Math.min(255, Math.max(0, v)))
		.toString(16)
		.padStart(2, "0");

const hex = ([r, g, b]: Rgb) => `#${byte(r)}${byte(g)}${byte(b)}`;

function unhex(s: string): Rgb {
	const n = parseInt(s.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hue in degrees, saturation and lightness in 0..1. */
function hsl([r, g, b]: Rgb): [number, number, number] {
	const [rn, gn, bn] = [r / 255, g / 255, b / 255];
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;
	const d = max - min;
	if (d === 0) return [0, 0, l];
	const s = d / (1 - Math.abs(2 * l - 1));
	let h: number;
	if (max === rn) h = ((gn - bn) / d) % 6;
	else if (max === gn) h = (bn - rn) / d + 2;
	else h = (rn - gn) / d + 4;
	return [((h * 60) % 360 + 360) % 360, s, l];
}

/** Perceived brightness, 0..1 — enough to tell a margin from a printed edge. */
function luma([r, g, b]: Rgb): number {
	return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * WCAG relative luminance. Worth the pow() over the cheap weighted average
 * above: gamma-encoded values overstate how light a dark colour is, which is
 * exactly the mistake that puts black ink on a dark red spine.
 */
function relLuma([r, g, b]: Rgb): number {
	const lin = (v: number) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t,
	a[2] + (b[2] - a[2]) * t,
];

const contrast = (a: number, b: number) =>
	(Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * Ink for a spine, chosen against every band rather than against the average:
 * type runs the whole length of a spine, so a jacket whose edge goes from dark
 * to cream has to be legible at both ends. Whichever of black and white has the
 * better worst case wins, and the halo covers the rest.
 */
export function inkFor(art: SpineArt): { fg: string; shade: string } {
	const lumas = art.bands.map((b) => relLuma(unhex(b)));
	const light = Math.min(...lumas.map((l) => contrast(1, l)));
	const dark = Math.min(...lumas.map((l) => contrast(0, l)));
	return dark > light
		? { fg: "rgba(26, 20, 16, 0.9)", shade: "rgba(255, 255, 255, 0.45)" }
		: { fg: "rgba(255, 250, 242, 0.95)", shade: "rgba(0, 0, 0, 0.6)" };
}

/** `bands` as a CSS gradient running down the spine. */
export function bandGradient(bands: string[]): string {
	if (bands.length === 1) return bands[0];
	const stops = bands.map((c, i) => `${c} ${((i / (bands.length - 1)) * 100).toFixed(1)}%`);
	return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

// ── sampling the jacket ────────────────────────────────────────

const BANDS = 28;
/** How much of the cover's width counts as "the bit that wraps round". */
const EDGE_FRACTION = 0.035;
/** How far each sampled band is pulled back towards the spine's own colour. */
const TEMPER = 0.5;
/** And how far, after that, any band may still stray from its value. */
const VALUE_SPAN = 0.18;

function context(w: number, h: number): CanvasRenderingContext2D | null {
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (ctx) ctx.imageSmoothingQuality = "high";
	return ctx;
}

/** Average each row of a freshly-drawn ImageData into one colour. */
function rows(data: Uint8ClampedArray, w: number, h: number): Rgb[] {
	const out: Rgb[] = [];
	for (let y = 0; y < h; y++) {
		let [r, g, b] = [0, 0, 0];
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			r += data[i];
			g += data[i + 1];
			b += data[i + 2];
		}
		out.push([r / w, g / w, b / w]);
	}
	return out;
}

const mean = (colours: Rgb[]): Rgb =>
	colours.reduce<Rgb>(
		(a, c) => [
			a[0] + c[0] / colours.length,
			a[1] + c[1] / colours.length,
			a[2] + c[2] / colours.length,
		],
		[0, 0, 0],
	);

/**
 * What the edge is "about": its most saturated band, ignoring the ones dark or
 * pale enough to be ink and paper. This is the colour a binder would have
 * matched the cloth to, and what the rest of the spine is tinted towards.
 */
function keyColour(bands: Rgb[]): Rgb {
	let best = mean(bands);
	let score = 0.2;
	for (const band of bands) {
		const [, s, l] = hsl(band);
		if (l < 0.1 || l > 0.92) continue;
		if (s > score) {
			score = s;
			best = band;
		}
	}
	return best;
}

/**
 * One band of the wrap, tinted towards the spine's key colour and then held
 * within VALUE_SPAN of its value. The tint keeps the spine coherent; the value
 * clamp is what stops a cream band crossing a dark jacket and taking the title
 * with it. The band's hue survives both, so the wrap is still legible as one.
 */
function calm(band: Rgb, key: Rgb): Rgb {
	const tinted = mix(band, key, TEMPER);
	const drift = Math.abs(luma(tinted) - luma(key));
	const over = drift - VALUE_SPAN;
	return over > 0 ? mix(tinted, key, over / drift) : tinted;
}

/**
 * The colour the whole cover is about, from a coarse downsample — the fallback
 * for a jacket whose left edge turns out to be a plain margin. Null when even
 * this finds nothing but greys, which the title hash does better.
 */
function dominant(bitmap: ImageBitmap): Rgb | null {
	const ctx = context(8, 8);
	if (!ctx) return null;
	ctx.drawImage(bitmap, 0, 0, 8, 8);
	// One pixel per "row", so the averaging is a no-op and each cell stays itself.
	const key = keyColour(rows(ctx.getImageData(0, 0, 8, 8).data, 1, 64));
	return hsl(key)[1] > 0.18 ? key : null;
}

/** A left edge that's just white paper or black ink carries nothing to wrap. */
function isPlainMargin(bands: Rgb[]): boolean {
	const sats = bands.map((b) => hsl(b)[1]);
	const lums = bands.map((b) => luma(b));
	const spread = Math.max(...lums) - Math.min(...lums);
	return Math.max(...sats) < 0.16 && spread < 0.1;
}

/** Three stops of shading, so a flat colour still reads as a curved spine. */
function shaded(base: Rgb): string[] {
	return [
		hex(mix(base, [255, 255, 255], 0.16)),
		hex(base),
		hex(mix(base, [0, 0, 0], 0.22)),
	];
}

async function sampleCover(blob: Blob): Promise<SpineArt | null> {
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(blob);
	} catch {
		// A CMYK JPEG, an SVG with no intrinsic size, a truncated file.
		return null;
	}
	try {
		const ctx = context(2, BANDS);
		if (!ctx) return null;
		// Draw only the leftmost sliver of the cover, squeezed into a 2×BANDS
		// strip: the browser's own downscale does the averaging across the sliver.
		const edge = Math.max(1, Math.round(bitmap.width * EDGE_FRACTION));
		ctx.drawImage(bitmap, 0, 0, edge, bitmap.height, 0, 0, 2, BANDS);
		let bands = rows(ctx.getImageData(0, 0, 2, BANDS).data, 2, BANDS);

		if (isPlainMargin(bands)) {
			const base = dominant(bitmap);
			if (!base) return null; // a genuinely grey cover; the title hash is livelier
			return { bands: shaded(base), accent: hex(base), source: "cover" };
		}

		// Pulled partway towards the edge's own key colour, because a wrapped
		// spine is mostly its base colour with the front's artwork bleeding round
		// the hinge — and because full-contrast bands leave the title unreadable
		// wherever a pale one crosses it. Towards the key colour rather than the
		// mean, which for a dark cover with a cream band is a washed-out pink.
		const key = keyColour(bands);
		bands = bands.map((b) => calm(b, key));
		return { bands: bands.map(hex), accent: hex(mean(bands)), source: "cover" };
	} catch {
		return null;
	} finally {
		bitmap.close();
	}
}

/**
 * The coverless spine, from the same title hash the generated front cover uses,
 * so a book looks like itself whichever way round you see it.
 */
export function titleArt(book: Book): SpineArt {
	const base = unhex(bandColour(book.title));
	return { bands: shaded(base), accent: hex(base), source: "title" };
}

// ── caching ────────────────────────────────────────────────────

// Bumped when the sampling changes, so old shelves resample instead of keeping
// colours the current code would never produce.
const KEY = "paper.spine.v1.";
const memo = new Map<number, SpineArt>();

/**
 * Art we already know, without touching a canvas. Synchronous on purpose: the
 * shelf's hue order reads this while it renders, so a reload lands in the same
 * arrangement it had rather than settling into it once the decodes finish.
 */
export function cachedArt(book: Book): SpineArt | null {
	const hit = memo.get(book.id);
	if (hit) return hit;
	try {
		const raw = localStorage.getItem(KEY + book.id);
		if (!raw) return null;
		const art = JSON.parse(raw) as SpineArt;
		if (!art?.bands?.length || !art.accent) return null;
		// A title-derived spine is provisional — a cover may have arrived since.
		if (art.source === "title" && book.has_cover) return null;
		memo.set(book.id, art);
		return art;
	} catch {
		return null;
	}
}

function remember(id: number, art: SpineArt): SpineArt {
	memo.set(id, art);
	try {
		localStorage.setItem(KEY + id, JSON.stringify(art));
	} catch {
		// Out of quota or in private mode: the in-memory copy still stands.
	}
	return art;
}

/** The art for a book, sampling its cover the first time and caching the result. */
export async function resolveArt(book: Book): Promise<SpineArt> {
	const cached = cachedArt(book);
	if (cached) return cached;
	let art: SpineArt | null = null;
	try {
		let blob = book.has_cover ? await library.cover(book.id) : undefined;
		// Same order of preference the cards used: what the file embedded, then
		// Open Library by ISBN. A hit here is stored, so this asks once per book.
		if (!blob && book.isbn) blob = (await lookupCover(book.id, book.isbn)) ?? undefined;
		if (blob) art = await sampleCover(blob);
	} catch {
		// A cover we can't read is not a book we can't shelve.
	}
	return remember(book.id, art ?? titleArt(book));
}

// ── shelf order ────────────────────────────────────────────────

/**
 * By hue, with the near-neutrals gathered at the end the way a colour-sorted
 * shelf always ends in blacks and greys, and the id as the tie-break. Both keys
 * are properties of the book itself, so adding one slots it in beside its own
 * colour instead of reshuffling everything around it.
 */
export function shelfOrder(books: Book[], artOf: (book: Book) => SpineArt): Book[] {
	const key = (book: Book): [number, number, number] => {
		const [h, s, l] = hsl(unhex(artOf(book).accent));
		// Start the run at warm red rather than at 0°, so the shelf reads
		// red → orange → yellow → green → blue → violet left to right.
		return s < 0.14 ? [1, l, book.id] : [0, (h + 345) % 360, book.id];
	};
	return [...books]
		.map((book) => ({ book, k: key(book) }))
		.sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2])
		.map((e) => e.book);
}

// ── type on the spine ──────────────────────────────────────────

export type SpineType = {
	/** The title as set: one line, or two when the spine is thick enough. */
	lines: string[];
	author: string;
	mark: string;
	size: number;
};

const PAD = 13; // head and tail margins, in px
const GAP = 12; // between the title and the author
/** A measured run within a few px of the room it has is a run that collides. */
const SLACK = 5;
/**
 * The imprint is stamped across the foot rather than along the spine, the way
 * most publishers set theirs, which is why it costs 20px of length and not the
 * 50-odd that its own name set vertically would.
 */
const MARK = 20;
const MARK_SIZE = 6;
/** The imprint isn't worth setting the title smaller than this to keep. */
const MARK_MIN_TITLE = 11;
const AUTHOR_MIN_PX = 32; // below this the author is noise, not information
/** Shrinking the title past this to keep a byline is a bad trade. */
const AUTHOR_FLOOR = 10;
const MARK_MIN_PX = 34;
/** Steps to try, largest first. The floor is where a spine stops being read. */
const SIZES = [14, 13, 12, 11, 10, 9, 8];

// These have to stay in step with BookSpine's stylesheet, since that is what
// the measurements below are predicting.
const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const SANS = "ui-sans-serif, system-ui, sans-serif";
const TITLE_TRACK = 0.09; // em
const AUTHOR_TRACK = 0.03;
const AUTHOR_SCALE = 0.86;
/** Line box of a run of vertical type, as a multiple of its size. */
const LEAD = 1.18;
/** Left over either side of the type across the spine's width. */
const CROSS_PAD = 6;

// One canvas for the whole shelf. Measuring a string costs microseconds and it
// beats guessing at the cap width of whichever serif the browser actually has —
// which is the difference between type that fits and type the CSS has to cut.
let gauge: CanvasRenderingContext2D | null | undefined;

/** The length a run of type will occupy along the spine, tracking included. */
function advance(text: string, font: string, size: number, track: number): number {
	if (gauge === undefined)
		gauge =
			typeof document === "undefined"
				? null
				: document.createElement("canvas").getContext("2d");
	if (!gauge) return text.length * size * 0.72; // no canvas: a wide-ish guess
	gauge.font = font;
	return gauge.measureText(text).width + text.length * size * track;
}

/** Publishers publish; the imprint is the part worth stamping on a spine. */
function publisherMark(publisher?: string): string {
	const word = (publisher ?? "")
		.split(/[\s,/&|-]+/)
		.find((w) => w.length > 2 && !/^(the|and|books?|book|publish\w*|press|group|ltd|llc|inc|co|company|editions?|imprint)$/i.test(w));
	return (word ?? "").slice(0, 10).toUpperCase();
}

/**
 * Vertical type turns fitting into a one-dimensional problem: the spine's
 * height is the line length, and every run is measured against it on a canvas
 * rather than laid out and inspected, so a shelf of forty costs no reflows.
 *
 * Concessions come in the order a typesetter would make them: set the type
 * smaller, cut the byline back to a surname, drop it altogether, drop the
 * imprint, and only cut into the title once the type is as small as it can be
 * and still be read.
 */
export function spineType(book: Book, width: number, height: number): SpineType {
	const title = (book.title || "Untitled").trim().toUpperCase();
	const author = width >= AUTHOR_MIN_PX ? (book.author ?? "").trim() : "";

	// A thick book carries bigger type, the way a thick book does.
	const cap = Math.min(14, Math.max(10.5, width * 0.34));
	const steps = SIZES.filter((s) => s <= cap);
	// Letter-spaced caps for the title, a slightly smaller italic for the author.
	const titleRun = (size: number) =>
		advance(title, `700 ${size}px ${SERIF}`, size, TITLE_TRACK);
	const authorRun = (byline: string, size: number) =>
		byline
			? advance(
					byline,
					`italic ${size * AUTHOR_SCALE}px ${SERIF}`,
					size * AUTHOR_SCALE,
					AUTHOR_TRACK,
				) + GAP
			: 0;

	// The imprint is decoration and the title isn't, so it is only stamped when it
	// fits across the spine and the tail can spare the room without squeezing.
	const wanted = width >= MARK_MIN_PX ? publisherMark(book.publisher) : "";
	const marks =
		wanted &&
		advance(wanted, `700 ${MARK_SIZE}px ${SANS}`, MARK_SIZE, AUTHOR_TRACK) <= width - 8 &&
		titleRun(MARK_MIN_TITLE) <= height - 2 * PAD - SLACK - MARK
			? [wanted, ""]
			: [""];

	// The full name, then just the surname — the way a spine credits an author
	// when the jacket has already said it in full — then nothing.
	const surname = author.split(/\s+/).filter(Boolean).pop() ?? "";
	const bylines = [author, ...(surname && surname !== author ? [surname] : []), ""];
	const roomFor = (mark: string) => height - 2 * PAD - SLACK - (mark ? MARK : 0);
	for (const byline of bylines)
		for (const mark of marks)
			for (const size of steps) {
				if (byline && size < AUTHOR_FLOOR) continue;
				if (titleRun(size) + authorRun(byline, size) <= roomFor(mark))
					return { lines: [title], author: byline, mark, size };
			}

	// One line at any size didn't fit. Before cutting words out of the title,
	// spend the spine's *width* instead: a thick enough book carries the title
	// over two lines, which is what a binder does with a long title.
	for (const byline of bylines)
		for (const mark of marks)
			for (const size of steps) {
				if (byline && size < AUTHOR_FLOOR) continue;
				if (!twoLinesFit(width, size)) continue;
				const split = balance(title, size, roomFor(mark) - authorRun(byline, size));
				if (split) return { lines: split, author: byline, mark, size };
			}

	// Nothing fits: keep the imprint (it costs almost nothing) and cut the title.
	const mark = marks[0];
	const room = roomFor(mark);
	const size = steps[steps.length - 1];
	// Two lines are still two chances to say more of the title before the cut.
	const room2 = twoLinesFit(width, size) ? room : 0;
	if (room2) {
		const head = trimTo(title, size, room2);
		const rest = title.slice(head.length).trim();
		if (rest) return { lines: [head, ellipsise(rest, size, room2)], author: "", mark, size };
	}
	return { lines: [ellipsise(title, size, room)], author: "", mark, size };
}

/** Whether two runs of vertical type stand side by side across this spine. */
function twoLinesFit(width: number, size: number): boolean {
	return 2 * size * LEAD <= width - CROSS_PAD;
}

/** The longest run of whole words that fits, or the first word if none does. */
function trimTo(text: string, size: number, room: number): string {
	const words = text.split(" ");
	let head = "";
	for (const word of words) {
		const next = head ? `${head} ${word}` : word;
		if (head && advance(next, `700 ${size}px ${SERIF}`, size, TITLE_TRACK) > room) break;
		head = next;
	}
	return head;
}

/** The run cut to length with an ellipsis, on a word boundary where there is one. */
function ellipsise(text: string, size: number, room: number): string {
	const font = `700 ${size}px ${SERIF}`;
	if (advance(text, font, size, TITLE_TRACK) <= room) return text;
	// Start from the length the full run's own advance implies, then walk in.
	let fits = Math.max(
		4,
		Math.floor((text.length * room) / advance(text, font, size, TITLE_TRACK)),
	);
	while (fits > 4 && advance(text.slice(0, fits) + "…", font, size, TITLE_TRACK) > room)
		fits -= 1;
	// Break at a word if there's one anywhere near the end of the budget, so a
	// long subtitle is dropped rather than sliced mid-syllable.
	const cut = text.slice(0, fits);
	const space = cut.lastIndexOf(" ");
	return (space > fits * 0.6 ? cut.slice(0, space) : cut.trimEnd()) + "…";
}

/**
 * The title over two lines, broken at the word that leaves the two runs most
 * even — a spine reads as a block of type, and one long line beside a short one
 * reads as a mistake. Null when even the best break still overruns.
 */
function balance(title: string, size: number, room: number): string[] | null {
	const words = title.split(" ").filter(Boolean);
	if (words.length < 2 || room <= 0) return null;
	const font = `700 ${size}px ${SERIF}`;
	const run = (t: string) => advance(t, font, size, TITLE_TRACK);
	let best: string[] | null = null;
	let evenness = Infinity;
	for (let i = 1; i < words.length; i++) {
		const pair = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
		const [a, b] = pair.map(run);
		if (Math.max(a, b) > room) continue;
		if (Math.abs(a - b) < evenness) {
			evenness = Math.abs(a - b);
			best = pair;
		}
	}
	return best;
}
