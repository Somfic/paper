// Books you can add without having a file: the Standard Ebooks catalogue, and
// the one fetch that turns an entry in it into a book on the shelf.
//
// Everything here leans on one fact — standardebooks.org serves its epubs with
// `Access-Control-Allow-Origin: *`. That is what lets a site with no server of
// its own hand a book to the browser: paper never proxies the file, it just
// asks for it and gets it. Almost nowhere else does this. Project Gutenberg,
// the Internet Archive and Wikisource all send their epubs without the header,
// so a browser refuses to read the response and the only way in would be a
// proxy paper doesn't have.
//
// The catalogue itself is `static/catalog.json`, walked out of Standard Ebooks'
// listing pages at build time by `scripts/catalog.ts` — a fetch the browser is
// spared, and one that doesn't need CORS because it happens in CI.

import * as library from "$lib/library";
import type { Book } from "$lib/library";
import { ingest } from "$lib/library/ingest";

const SITE = "https://standardebooks.org";
/** Sibling of the app shell in `static/`, so the same path in dev and build. */
const CATALOG_URL = "/catalog.json";

/** One book in the catalogue — as little of it as the browse panel needs. */
export type CatalogBook = {
	/** Path under `/ebooks/`, e.g. `jane-austen/pride-and-prejudice`. */
	slug: string;
	title: string;
	/** Usually one; empty for the handful of anthologies with no named author. */
	authors: string[];
	/** The content hash in the cover's path — see `coverUrl`. */
	cover: string;
};

/**
 * Standard Ebooks flattens a book's path into one name by joining its segments
 * with underscores, and uses that for both the epub filename and the cover
 * directory. Translated works have a third segment for the translator, which is
 * why this is a replace and not a pair of fields.
 */
const flat = (slug: string) => slug.replace(/\//g, "_");

/**
 * Where the epub lives. The `?source=download` matters: without it the URL
 * answers a "Your Download Has Started!" interstitial page instead of the file,
 * which arrives as a perfectly successful response full of HTML.
 */
export const downloadUrl = (book: CatalogBook) =>
	`${SITE}/ebooks/${book.slug}/downloads/${flat(book.slug)}.epub?source=download`;

/**
 * The jacket, at 224×335. Covers are content-addressed, so the hash from the
 * catalogue is not decoration — the path doesn't resolve without it. Rendered
 * through a plain `<img>`, which needs no CORS at all.
 */
export const coverUrl = (book: CatalogBook) =>
	`${SITE}/images/covers/${flat(book.slug)}/${book.cover}/cover.jpg`;

/** The `Book.source` an import writes, and what marks an entry as already had. */
export const sourceId = (book: CatalogBook) => `standardebooks:${book.slug}`;

/** "Austen" or "Austen and Brontë" or "" — the byline under a card. */
export function byline(book: CatalogBook): string {
	if (book.authors.length < 2) return book.authors[0] ?? "";
	return `${book.authors.slice(0, -1).join(", ")} and ${book.authors.at(-1)}`;
}

let cached: Promise<CatalogBook[]> | null = null;

/**
 * The catalogue, fetched once per page load and only when something asks for
 * it — it is ~290KB, which is worth nothing to the shelf until the browse panel
 * opens.
 */
export function load(): Promise<CatalogBook[]> {
	if (cached) return cached;
	cached = (async () => {
		const res = await fetch(CATALOG_URL);
		if (!res.ok) throw new Error(`the catalogue is unavailable (HTTP ${res.status})`);
		const { books } = await res.json();
		if (!Array.isArray(books)) throw new Error("the catalogue is malformed");
		return books as CatalogBook[];
	})();
	// A failed fetch must not be cached, or opening the panel again replays it.
	cached.catch(() => {
		cached = null;
	});
	return cached;
}

/** Words shared by a book's title and byline, lowercased, for matching. */
const haystack = (book: CatalogBook) =>
	`${book.title} ${book.authors.join(" ")}`.toLowerCase();

/**
 * Entries matching `query`, every whitespace-separated term having to appear
 * somewhere in the title or the authors — so "austen pride" finds the book and
 * so does "pride austen".
 */
export function search(books: CatalogBook[], query: string): CatalogBook[] {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (!terms.length) return books;
	return books.filter((book) => {
		const text = haystack(book);
		return terms.every((term) => text.includes(term));
	});
}

/**
 * Fetch `book`'s epub and put it on the shelf, then parse it like any other
 * file.
 *
 * The catalogue's title and author are written at add time and the epub's own
 * are read straight after, which sounds redundant and isn't. The epub is the
 * authority — it is the thing actually being read, and a catalogue can go stale
 * — but ingesting is allowed to fail once and then never retry, so a book with
 * nothing but a filename to fall back on would keep the filename forever. This
 * way the worst a failed parse costs is the word count and the jacket.
 *
 * `onAdded` fires at that halfway point, so a shelf can show the book, already
 * titled, while the parse it doesn't need to wait for finishes.
 */
export async function importBook(
	book: CatalogBook,
	onAdded?: (added: Book) => void,
): Promise<Book> {
	const res = await fetch(downloadUrl(book));
	if (!res.ok) throw new Error(`could not download “${book.title}” (HTTP ${res.status})`);
	const blob = await res.blob();
	// The interstitial page is a 200 with a body, so a successful response is
	// not on its own proof of a book; an epub is a zip, and its first two bytes
	// say so.
	const magic = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
	if (magic[0] !== 0x50 || magic[1] !== 0x4b)
		throw new Error(`“${book.title}” did not download as an epub`);

	const file = new File([blob], `${flat(book.slug)}.epub`, {
		type: "application/epub+zip",
	});
	const added = await library.add(file, {
		title: book.title,
		author: byline(book),
		source: sourceId(book),
	});
	onAdded?.(added);
	return ingest(added.id);
}
