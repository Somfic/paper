// Prerendered purely so the build emits an index.html for `/`. With `ssr =
// false` inherited from the layout there is nothing to render server-side —
// the output is the same app shell as the 404.html fallback.
export const prerender = true;
