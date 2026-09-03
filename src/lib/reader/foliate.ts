// Foliate-js helpers: metadata coercion, TOC flattening, and loading the
// web component from /static. Pure utilities — no reactive state.

export type TocEntry = { label: string; href: string; depth: number };

// ── metadata helpers (foliate values can be string | object | array) ──
export function pickText(v: any): string {
	if (!v) return "";
	if (typeof v === "string") return v;
	if (Array.isArray(v)) return pickText(v[0]);
	if (typeof v === "object")
		return v.en ?? (Object.values(v)[0] as string) ?? "";
	return String(v);
}

export function authorName(a: any): string {
	if (!a) return "";
	const x = Array.isArray(a) ? a[0] : a;
	if (typeof x === "string") return x;
	return pickText(x?.name ?? x);
}

/** Flatten foliate's (possibly nested) TOC into a list with depth for the menu. */
export function flattenToc(
	items: any[],
	depth = 0,
	out: TocEntry[] = [],
): TocEntry[] {
	for (const it of items ?? []) {
		if (it?.href) out.push({ label: pickText(it.label), href: it.href, depth });
		if (it?.subitems?.length) flattenToc(it.subitems, depth + 1, out);
	}
	return out;
}

/** Where foliate-js lives — served from /static, never bundled. */
const VIEW_URL = "/foliate-js/view.js";

/** One promise for the whole app; see `loadFoliate`. */
let viewModule: Promise<any> | null = null;

/**
 * Load foliate-js and hand back its module: `makeBook` for anyone parsing a
 * file of their own, and `<foliate-view>` registered as a side effect of
 * evaluating it. Imported by URL because vite refuses to bundle the public
 * dir, the same deal as the footnote handler.
 *
 * Memoised, and it has to be. view.js calls `customElements.define` at module
 * top level, so a second evaluation throws on the duplicate name and the throw
 * takes every export with it. Loading it once through a <script> tag and again
 * through `import()` of the same path was exactly that — two evaluations,
 * because vite's dev server serves the imported copy from a second URL
 * (`view.js?import`). It cost the reader nothing visible, since the element
 * was already registered by then, and killed both things that parse a book on
 * their own: the metadata ingest and the character scan.
 */
export function loadFoliate(): Promise<any> {
	viewModule ??= import(/* @vite-ignore */ VIEW_URL);
	return viewModule;
}
