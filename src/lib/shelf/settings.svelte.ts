// Shelf preferences. There is exactly one, and it governs whether the app is
// allowed to talk to anyone but the user's own disk — so it defaults to off and
// is only ever changed by the toggle on the shelf.

export type ShelfSettings = {
	/**
	 * Look up missing covers on Open Library by ISBN. Off by default: doing it
	 * tells a third party which books are on this shelf, which is not a trade
	 * anyone should make silently for a picture.
	 */
	openLibraryCovers: boolean;
};

export const DEFAULTS: ShelfSettings = { openLibraryCovers: false };

const STORAGE_KEY = "paper.shelf";

export const shelf = $state<ShelfSettings>({ ...DEFAULTS });

/**
 * Read the stored preference into `shelf`. Called from the shelf's `onMount`,
 * not at module load — the build prerenders the page shell, where there is no
 * localStorage to read.
 */
export function loadShelfSettings() {
	try {
		Object.assign(shelf, DEFAULTS, JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
	} catch {
		Object.assign(shelf, DEFAULTS);
	}
}

export function setOpenLibraryCovers(on: boolean) {
	shelf.openLibraryCovers = on;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(shelf));
	} catch {}
}
