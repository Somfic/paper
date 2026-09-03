// Parsing a book once, at add time, so the shelf can show the truth: the
// epub's own title and author, its publisher and ISBN, how long it is, and its
// cover art. Books added before this existed have no metadata but still have
// their file, so the same routine backfills them from `files`.

import * as library from "$lib/library";
import type { Book, BookMetadata } from "$lib/library";
import { authorName, pickText } from "$lib/reader/foliate";

// Vite refuses to bundle an import() of a file in the public dir, so the
// specifier goes through a variable to keep it out of static analysis. Same URL
// as loadFoliate()'s script tag, so the browser reuses the one module instance.
const VIEW_URL = "/foliate-js/view.js";

const ISBN13 = /^97[89]\d{10}$/;
const ISBN10 = /^\d{9}[\dX]$/;

/** Ingest hasn't been attempted yet — the shelf's cue to backfill. */
export const needsIngest = (book: Book) => !book.ingested_at;

/**
 * An epub's identifiers are a grab bag of UUIDs, DOIs and calibre ids; only an
 * ISBN is any use to a cover lookup. Hyphens and an `isbn:`/`urn:isbn:` prefix
 * are stripped, but nothing else is, so a UUID can't be mangled into a number
 * that happens to pass.
 */
function pickIsbn(metadata: any): string {
	const candidates: string[] = [];
	const collect = (v: any) => {
		if (!v) return;
		if (Array.isArray(v)) return v.forEach(collect);
		if (typeof v === "object") return collect(v.value ?? v.identifier);
		candidates.push(String(v));
	};
	collect(metadata?.identifier);
	collect(metadata?.altIdentifier);
	collect(metadata?.source);

	for (const raw of candidates) {
		const bare = raw
			.replace(/^urn:/i, "")
			.replace(/^isbn[:\s]*/i, "")
			.replace(/[-\s]/g, "")
			.toUpperCase();
		if (ISBN13.test(bare) || ISBN10.test(bare)) return bare;
	}
	return "";
}

/**
 * Total words across the linear spine. Every section is parsed to a document,
 * so the loop hands control back between sections rather than holding the main
 * thread for the length of a book — the shelf stays live while this runs.
 */
async function countWords(sections: any[]): Promise<number> {
	let words = 0;
	for (const section of sections ?? []) {
		// EPUB keeps the raw spine attribute, so non-linear reads "no" here
		// rather than false; both mean "not part of the reading order".
		if (section?.linear === false || section?.linear === "no") continue;
		try {
			const doc = await section.createDocument?.();
			const text = doc?.body?.textContent ?? doc?.documentElement?.textContent ?? "";
			if (text) words += text.trim().split(/\s+/).filter(Boolean).length;
		} catch {
			// A section that won't parse costs us its words, not the whole count.
		}
		section.unload?.();
		await new Promise((r) => setTimeout(r, 0));
	}
	return words;
}

/**
 * Parse `file` with foliate and return everything worth storing. The cover is
 * whatever the format embeds, or null — resolving that to something showable is
 * `library/covers`' job.
 */
async function parse(file: File): Promise<{ metadata: BookMetadata; cover: Blob | null }> {
	const { makeBook } = await import(/* @vite-ignore */ VIEW_URL);
	const book = await makeBook(file);
	const meta = book?.metadata ?? {};

	// Left empty when the epub has none, rather than filled with the filename:
	// what a book already has is at worst its filename anyway (`library.add`
	// puts the stem there) and at best the title the catalogue it came from knew,
	// which a stem would be a downgrade from. `ingest` drops the empty fields
	// instead of writing them, so the better answer survives either way.
	const title = pickText(meta.title).trim();

	// An epub whose manifest names a cover it no longer contains still answers
	// getCover(), with a few bytes of nothing — check before believing it.
	const embedded: Blob | null =
		typeof book?.getCover === "function" ? ((await book.getCover()) ?? null) : null;
	const cover = embedded?.size && embedded.type.startsWith("image/") ? embedded : null;

	const metadata: BookMetadata = {
		title,
		author: authorName(meta.author).trim(),
		publisher: authorName(meta.publisher).trim(),
		isbn: pickIsbn(meta),
		word_count: await countWords(book?.sections),
	};

	book?.destroy?.();
	return { metadata, cover };
}

/** Ids being parsed right now, so a re-render can't queue the same book twice. */
const inFlight = new Set<number>();

/**
 * The fields the epub actually answered for. An empty string means the file had
 * nothing to say on the subject, and saying nothing must not overwrite what the
 * book already had — a title and author seeded from a catalogue, or the
 * filename. Numbers are kept as they are: a word count of zero is a fact about
 * a book with no words in it.
 */
function answered(metadata: BookMetadata): Partial<BookMetadata> {
	return Object.fromEntries(
		Object.entries(metadata).filter(([, v]) => v !== "" && v != null),
	);
}

/**
 * Parse the stored file for `id` and fold the result into its shelf entry.
 * `ingested_at` is stamped even when parsing throws: a file we can't read won't
 * become readable on the next load, and retrying it forever would reparse the
 * whole shelf every time.
 */
export async function ingest(id: number): Promise<Book> {
	try {
		const { metadata, cover } = await parse(await library.file(id));
		if (cover) await library.putCover(id, cover);
		return await library.update(id, {
			...answered(metadata),
			ingested_at: new Date().toISOString(),
		});
	} catch (e) {
		console.warn(`paper: could not ingest book ${id}`, e);
		return library.update(id, { ingested_at: new Date().toISOString() });
	}
}

/**
 * Ingest every book in `books` that hasn't been, one at a time, reporting each
 * as it lands. Deliberately sequential: parsing is the expensive part and a
 * whole shelf of it in parallel would starve the UI it's updating.
 */
export async function backfill(
	books: Book[],
	onIngested: (book: Book) => void,
): Promise<void> {
	for (const book of books) {
		if (!needsIngest(book) || inFlight.has(book.id)) continue;
		inFlight.add(book.id);
		try {
			onIngested(await ingest(book.id));
		} finally {
			inFlight.delete(book.id);
		}
	}
}
