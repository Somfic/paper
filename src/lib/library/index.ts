// The library, entirely in the browser: metadata in the `books` object store,
// raw file bytes in `files`, cover art in `covers`, the cached character scan in
// `characters`, all keyed by the same autoincrement id. There is no server, so a
// shelf is per-browser and nothing ever leaves the device.

import type { CharacterIndex } from "$lib/reader/characters";

/**
 * A book in the library. The filename-derived fields are set at add time; the
 * rest are filled in by `ingest()` once foliate has parsed the file, so on an
 * un-ingested book they are absent.
 */
export type Book = {
	id: number;
	title: string;
	original_filename: string;
	format: string;
	/** ISO-8601, set at add time. */
	added_at: string;
	author?: string;
	publisher?: string;
	/** ISBN-10/13 digits only, when the epub's identifiers contain one. */
	isbn?: string;
	word_count?: number;
	/** Whether `covers` holds art for this id — embedded or fetched. */
	has_cover?: boolean;
	/**
	 * ISO-8601 of the last ingest attempt. Absent means never parsed, which is
	 * what the shelf's backfill looks for; it is stamped even when parsing
	 * fails, so a broken file isn't retried on every load.
	 */
	ingested_at?: string;
};

/** The subset of `Book` that ingesting a file can discover. */
export type BookMetadata = Pick<
	Book,
	"title" | "author" | "publisher" | "isbn" | "word_count"
>;

const DB_NAME = "paper";
const DB_VERSION = 3;
const BOOKS = "books";
const FILES = "files";
const COVERS = "covers";
const CHARACTERS = "characters";

/** localStorage key for a book's saved reading position (a CFI string). */
export const posKey = (bookId: number) => `paper.pos.${bookId}`;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		if (typeof indexedDB === "undefined") {
			reject(new Error("this browser has no IndexedDB, so the shelf can't be stored"));
			return;
		}
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(BOOKS))
				db.createObjectStore(BOOKS, { keyPath: "id", autoIncrement: true });
			// Files and covers are keyed by the book id assigned in BOOKS — no key
			// path of their own, since the values are bare Blobs.
			if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
			// v2. Books that predate it keep their file and get their metadata and
			// cover backfilled from it in the background — see library/ingest.
			if (!db.objectStoreNames.contains(COVERS)) db.createObjectStore(COVERS);
			// v3. Every store here is created only when it is missing, so upgrading
			// from any earlier version adds what is new and leaves the rest — and
			// its contents — exactly as they were. The character scan is a pure
			// function of the file, so a book that predates this store just gets
			// scanned again next time it is opened; see reader/characters.
			if (!db.objectStoreNames.contains(CHARACTERS))
				db.createObjectStore(CHARACTERS);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error ?? new Error("failed to open the library"));
		// Fires when another tab holds an older version open; the shelf there is
		// stale but functional, so surface it rather than hanging forever.
		req.onblocked = () =>
			reject(new Error("another paper tab is holding the library open — close it and reload"));
	});
	// A failed open must not be cached, or every later call replays the error.
	dbPromise.catch(() => {
		dbPromise = null;
	});
	return dbPromise;
}

/** Promisify a single request, and fail the whole transaction alongside it. */
function wrap<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error ?? new Error("library request failed"));
	});
}

/** Resolve once the transaction commits, so callers see durable writes. */
function done(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error ?? new Error("library write failed"));
		tx.onabort = () => reject(tx.error ?? new Error("library write aborted"));
	});
}

/** All books, newest first — matches the old `library/list` ordering. */
export async function list(): Promise<Book[]> {
	const db = await openDb();
	const books = await wrap<Book[]>(db.transaction(BOOKS, "readonly").objectStore(BOOKS).getAll());
	return books.sort((a, b) => b.id - a.id);
}

/** A single book by id. Throws if it isn't on the shelf. */
export async function get(id: number): Promise<Book> {
	const db = await openDb();
	const book = await wrap<Book | undefined>(
		db.transaction(BOOKS, "readonly").objectStore(BOOKS).get(id),
	);
	if (!book) throw new Error("book not found");
	return book;
}

/**
 * The raw file for `id`, as a `File`. foliate's `view.open()` takes anything
 * with an `arrayBuffer()` method, so this goes straight in — no URL needed.
 */
export async function file(id: number): Promise<File> {
	const db = await openDb();
	const [book, blob] = await Promise.all([
		get(id),
		wrap<Blob | undefined>(db.transaction(FILES, "readonly").objectStore(FILES).get(id)),
	]);
	if (!blob) throw new Error("book has no file");
	return new File([blob], book.original_filename, { type: blob.type });
}

/** Store an uploaded file and return its shelf entry. */
export async function add(upload: File): Promise<Book> {
	const db = await openDb();
	const name = upload.name;
	const dot = name.lastIndexOf(".");
	// Extension → format, stem → provisional title. Ingesting the file replaces
	// the title with the epub's own, when it has one worth having.
	const format = (dot > 0 ? name.slice(dot + 1) : "epub").toLowerCase();
	const title = dot > 0 ? name.slice(0, dot) : name;

	const entry = {
		title,
		original_filename: name,
		format,
		added_at: new Date().toISOString(),
	};

	const tx = db.transaction([BOOKS, FILES], "readwrite");
	const id = await wrap<IDBValidKey>(tx.objectStore(BOOKS).add(entry));
	tx.objectStore(FILES).put(upload, id);
	await done(tx);
	return { id: id as number, ...entry };
}

/**
 * Merge `patch` into a book's stored record and return the result. Read and
 * write share one transaction so a concurrent patch can't drop fields.
 */
export async function update(id: number, patch: Partial<Book>): Promise<Book> {
	const db = await openDb();
	const tx = db.transaction(BOOKS, "readwrite");
	const store = tx.objectStore(BOOKS);
	const current = await wrap<Book | undefined>(store.get(id));
	if (!current) throw new Error("book not found");
	const merged = { ...current, ...patch, id };
	store.put(merged);
	await done(tx);
	return merged;
}

/** Stored cover art for `id`, or undefined if there is none. */
export async function cover(id: number): Promise<Blob | undefined> {
	const db = await openDb();
	return wrap<Blob | undefined>(db.transaction(COVERS, "readonly").objectStore(COVERS).get(id));
}

/** Store cover art and flag the book as having it, in one transaction. */
export async function putCover(id: number, blob: Blob): Promise<void> {
	const db = await openDb();
	const tx = db.transaction([BOOKS, COVERS], "readwrite");
	tx.objectStore(COVERS).put(blob, id);
	const books = tx.objectStore(BOOKS);
	const current = await wrap<Book | undefined>(books.get(id));
	if (current) books.put({ ...current, has_cover: true });
	await done(tx);
}

/**
 * The cached character scan for `id`, or undefined when it was never built.
 * Callers check `version` themselves: an index built by older heuristics is
 * still readable, just not worth keeping.
 */
export async function characters(
	id: number,
): Promise<CharacterIndex | undefined> {
	const db = await openDb();
	return wrap<CharacterIndex | undefined>(
		db.transaction(CHARACTERS, "readonly").objectStore(CHARACTERS).get(id),
	);
}

/** Store the character scan for `id`, replacing any earlier one. */
export async function putCharacters(
	id: number,
	index: CharacterIndex,
): Promise<void> {
	const db = await openDb();
	const tx = db.transaction(CHARACTERS, "readwrite");
	tx.objectStore(CHARACTERS).put(index, id);
	await done(tx);
}

/** Remove a book, its file, its cover, its cast, and its reading position. */
export async function remove(id: number): Promise<void> {
	const db = await openDb();
	const tx = db.transaction([BOOKS, FILES, COVERS, CHARACTERS], "readwrite");
	tx.objectStore(BOOKS).delete(id);
	tx.objectStore(FILES).delete(id);
	tx.objectStore(COVERS).delete(id);
	tx.objectStore(CHARACTERS).delete(id);
	await done(tx);
	try {
		localStorage.removeItem(posKey(id));
	} catch {}
}
