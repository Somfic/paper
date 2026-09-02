// Driving the reader from outside it. Everything here exists because a book is
// not an ordinary page: the prose renders inside foliate's iframes, the shelf
// keeps its books in IndexedDB, and a section is laid out as columns that run
// off both sides of the viewport.

/** Put a book on the shelf and wait for the ingest to finish. */
export async function addBook(page, epub, { timeout = 20000 } = {}) {
	await page.setInputFiles("input[type=file]", epub);
	await page.waitForSelector(".card, .book", { timeout });
	// Ingest rewrites the record once it has read the metadata and the cover,
	// and the shelf re-sorts when it does. Clicking before that lands on
	// whichever book happened to be under the pointer a moment ago.
	await page.waitForTimeout(2500);
}

/**
 * Open a book from the shelf and wait for the first page to be drawn.
 *
 * Pass a title rather than an index wherever there is more than one book on the
 * shelf: the shelf re-sorts itself once the covers have been sampled for hue,
 * so "the first one" is not stable, and the book you thought you opened may be
 * the one you added before it.
 */
export async function openBook(page, target = 0) {
	const spine =
		typeof target === "number"
			? page.locator(".card, .book a").nth(target)
			: page.locator(`[aria-label*="${target}"], [title*="${target}"]`).first();
	await spine.click();
	await page.waitForSelector("foliate-view", { timeout: 20000 });
	await page.waitForTimeout(4000);
}

/**
 * Forget where you were in a book. The reader restores the last position on
 * open, so a test that means "start of the book" has to say so.
 */
export async function forgetPosition(page, bookId) {
	await page.evaluate((id) => localStorage.removeItem(`paper.pos.${id}`), bookId);
}

/** Turn pages, giving each turn time to settle. */
export async function turn(page, times = 1, key = "ArrowRight") {
	for (let i = 0; i < Math.abs(times); i++) {
		await page.keyboard.press(times < 0 ? "ArrowLeft" : key);
		await page.waitForTimeout(320);
	}
}

/**
 * Where a word is on screen, in the *top* document's coordinates.
 *
 * Two traps, and both have cost real debugging time:
 *
 *  - the section renders in a nested iframe, so a rect from inside it has to
 *    have the frame's own offset folded in before you can click it;
 *  - foliate lays out the whole section as columns and translates them, so the
 *    pages you have already read are still in the DOM, off to the left. The
 *    first match for a common word is very often at a negative x.
 *
 * So the default is "somewhere you could actually click": inside the viewport,
 * with a margin. Pass `nth` to walk further into the page.
 */
export async function locate(page, text, { nth = 0, margin = 24, band } = {}) {
	return page.evaluate(
		([text, nth, margin, band]) => {
			const view = document.querySelector("foliate-view");
			const doc = view?.renderer?.getContents?.()?.[0]?.doc;
			if (!doc) return null;
			const frame = doc.defaultView?.frameElement?.getBoundingClientRect() ?? {
				left: 0,
				top: 0,
			};
			const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
			let seen = 0;
			for (let node = walk.nextNode(); node; node = walk.nextNode()) {
				let from = -1;
				while ((from = node.nodeValue.indexOf(text, from + 1)) >= 0) {
					const range = doc.createRange();
					range.setStart(node, from);
					range.setEnd(node, from + text.length);
					const r = range.getBoundingClientRect();
					if (!r.width || !r.height) continue;
					const box = {
						left: r.left + frame.left,
						right: r.right + frame.left,
						top: r.top + frame.top,
						bottom: r.bottom + frame.top,
					};
					if (box.left < margin || box.right > innerWidth - margin) continue;
					if (box.top < margin || box.bottom > innerHeight - margin) continue;
					if (band && (box.top < band[0] || box.bottom > band[1])) continue;
					if (seen++ < nth) continue;
					return {
						...box,
						x: (box.left + box.right) / 2,
						y: (box.top + box.bottom) / 2,
					};
				}
			}
			return null;
		},
		[text, nth, margin, band ?? null],
	);
}

/** Click a word in the prose. Throws rather than clicking nothing. */
export async function clickText(page, text, options) {
	const at = await locate(page, text, options);
	if (!at) throw new Error(`no visible "${text}" on this page`);
	await page.mouse.click(at.x, at.y);
	return at;
}

/** A localStorage value, parsed as JSON when it is JSON. */
export async function stored(page, key) {
	const raw = await page.evaluate((k) => localStorage.getItem(k), key);
	if (raw == null) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

/** A record from one of the library's IndexedDB stores. */
export async function record(page, store, key) {
	return page.evaluate(
		async ([store, key]) => {
			const db = await new Promise((resolve, reject) => {
				const req = indexedDB.open("paper");
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			});
			if (!db.objectStoreNames.contains(store)) return null;
			return new Promise((resolve) => {
				const req = db.transaction(store, "readonly").objectStore(store).get(key);
				req.onsuccess = () => resolve(req.result ?? null);
				req.onerror = () => resolve(null);
			});
		},
		[store, key],
	);
}

/**
 * Wait for the character scan to land. It starts a beat after the book opens
 * and then parses every section again, so it is the slowest thing the reader
 * does and the one a test is most likely to race.
 */
export async function waitForCast(page, bookId = 1, timeout = 40000) {
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		const index = await record(page, "characters", bookId);
		if (index?.entries?.length) return index;
		await page.waitForTimeout(500);
	}
	return null;
}
