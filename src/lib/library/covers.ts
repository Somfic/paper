// Cover art, in order of preference: what the file embeds, then Open Library by
// ISBN, then a generated tri-band drawn from the title. The first two are Blobs
// cached in the `covers` object store; the last is SVG rendered live, so it
// costs nothing to keep regenerating.

import * as library from "$lib/library";

/**
 * Muted, print-like band colours — the palette a shelf of coverless books has
 * to survive, so nothing here glows. Picked by hashing the title, which keeps a
 * book's cover stable across reloads and devices without storing anything.
 */
const PALETTE = [
	"#d9622b", // orange
	"#1f6f4a", // green
	"#1d6b8a", // cyan
	"#7d2b32", // maroon
	"#3f4b7a", // indigo
	"#8a6a1e", // ochre
	"#4a5d23", // olive
	"#6b3f63", // plum
	"#8c4a2f", // brick
	"#3b3f46", // graphite
];

/** FNV-1a, for a spread that doesn't cluster on similar titles. */
function hash(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

export function bandColour(title: string): string {
	return PALETTE[hash(title.trim().toLowerCase()) % PALETTE.length];
}

// SVG has no line wrapping, so the title is broken up here. Smaller type buys
// more characters per line; the first step whose wrap fits its line budget wins.
const TITLE_STEPS = [
	{ size: 17, chars: 13, lines: 3 },
	{ size: 15, chars: 16, lines: 4 },
	{ size: 13, chars: 19, lines: 5 },
	{ size: 11, chars: 23, lines: 6 },
];

function wrap(text: string, chars: number): string[] {
	const lines: string[] = [];
	let line = "";
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (!line) line = word;
		else if (line.length + 1 + word.length <= chars) line += " " + word;
		else {
			lines.push(line);
			line = word;
		}
	}
	if (line) lines.push(line);
	return lines;
}

/** Title lines in caps, plus the font size they were wrapped for. */
export function titleLayout(title: string): { size: number; lines: string[] } {
	const caps = (title || "Untitled").toUpperCase();
	for (const step of TITLE_STEPS) {
		const lines = wrap(caps, step.chars);
		if (lines.length <= step.lines) return { size: step.size, lines };
	}
	const last = TITLE_STEPS[TITLE_STEPS.length - 1];
	const lines = wrap(caps, last.chars).slice(0, last.lines);
	lines[lines.length - 1] = lines[lines.length - 1].slice(0, last.chars - 1) + "…";
	return { size: last.size, lines };
}

// `default=false` is what makes this usable: without it a miss returns a grey
// placeholder image, with it a miss is a plain 404.
const OPEN_LIBRARY = (isbn: string) =>
	`https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`;

/** Ids we've already asked Open Library about and got nothing for. */
const missed = new Set<number>();

/**
 * Ask Open Library for a cover by ISBN and cache it in `covers`, so this is the
 * one request a book ever causes: a hit is stored, and a miss is remembered for
 * the session so re-rendering the card doesn't re-ask.
 */
export async function lookupCover(id: number, isbn: string): Promise<Blob | null> {
	if (!isbn || missed.has(id)) return null;
	try {
		const res = await fetch(OPEN_LIBRARY(isbn));
		if (!res.ok) {
			missed.add(id);
			return null;
		}
		const blob = await res.blob();
		// A zero-length or non-image body is a miss dressed up as a hit.
		if (!blob.size || !blob.type.startsWith("image/")) {
			missed.add(id);
			return null;
		}
		await library.putCover(id, blob);
		return blob;
	} catch (e) {
		// Offline, blocked by an extension, CORS — all the same to the shelf.
		console.warn(`paper: Open Library cover lookup failed for ${isbn}`, e);
		missed.add(id);
		return null;
	}
}
