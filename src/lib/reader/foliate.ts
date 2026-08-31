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

// Load foliate-js from /static via a module <script> tag — vite forbids
// import()-ing files in the public dir. view.js registers <foliate-view> at
// module top level, so the element exists once the load event fires.
export function loadFoliate(): Promise<void> {
	if (customElements.get("foliate-view")) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const existing = document.querySelector<HTMLScriptElement>(
			"script[data-foliate]",
		);
		if (existing) {
			existing.addEventListener("load", () => resolve());
			existing.addEventListener("error", () =>
				reject(new Error("foliate failed to load")),
			);
			return;
		}
		const s = document.createElement("script");
		s.type = "module";
		s.src = "/foliate-js/view.js";
		s.dataset.foliate = "";
		s.addEventListener("load", () => resolve());
		s.addEventListener("error", () =>
			reject(new Error("foliate failed to load")),
		);
		document.head.append(s);
	});
}
