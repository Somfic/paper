# paper

A static epub reader: SvelteKit 5 (runes) + [foliate-js](https://github.com/johnfactotum/foliate-js),
deployed to GitHub Pages at [paper.somfic.sh](https://paper.somfic.sh). No
server and no accounts — books, covers and the cast index live in IndexedDB,
reading positions and dog-ears in localStorage. UI chrome comes from
[glow](https://github.com/somfic/glow).

```sh
bun run dev      # localhost:5174
bun run check    # svelte-check; keep this at 0 errors
bun run build    # static output in build/
```

`static/foliate-js/` is vendored and imported at runtime by URL, not bundled —
vite will not process it, so anything reaching into it has to `import()` its
path (see `reader/foliate.ts`, `reader/folds.svelte.ts`).

## Seeing it work

`tools/` drives the built app in Chrome, for assertions and for the GIFs and
screenshots that go in a pull request. **Use it rather than reasoning about
whether a change works** — the reader is iframes, overlays and stacking
contexts, and it is very easy to be wrong about it from the outside.

```sh
node tools/scripts/cast.test.mjs      # a worked example to copy
node tools/scripts/cast.demo.mjs out.gif
```

`tools/README.md` has the rest, including the traps in clicking a word that
lives inside foliate's iframes.

## House style

Comments explain *why*, and are worth writing where a reader would otherwise
wonder — especially where a heuristic errs on purpose, or where a workaround is
load-bearing. No comment should restate the line under it.
