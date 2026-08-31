// The library, entirely in the browser: metadata in the `books` object store,
// raw file bytes in `files`, keyed by the same autoincrement id. There is no
// server, so a shelf is per-browser and nothing ever leaves the device.

/** A book in the library. Metadata is whatever the filename gives us. */
export type Book = {
	id: number;
	title: string;
	original_filename: string;
	format: string;
	/** ISO-8601, set at add time. */
	added_at: string;
};

const DB_NAME = "paper";
const DB_VERSION = 1;
const BOOKS = "books";
const FILES = "files";

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
			// Files are keyed by the book id assigned in BOOKS — no key path of
			// their own, since the value is a bare Blob.
			if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
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
	// Mirror the old server-side derivation: extension → format, stem → title.
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

/** Remove a book, its file, and its saved reading position. */
export async function remove(id: number): Promise<void> {
	const db = await openDb();
	const tx = db.transaction([BOOKS, FILES], "readwrite");
	tx.objectStore(BOOKS).delete(id);
	tx.objectStore(FILES).delete(id);
	await done(tx);
	try {
		localStorage.removeItem(posKey(id));
	} catch {}
}
