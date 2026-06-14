// Pure SPA: the UI talks to the backend RPC at runtime, so there's nothing to
// server-render or prerender. adapter-static emits an index.html fallback.
export const ssr = false;
export const prerender = false;
