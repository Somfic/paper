# paper

An epub reader that runs entirely in the browser. Books are added from your
machine, stored in IndexedDB, and rendered with
[foliate-js](https://github.com/johnfactotum/foliate-js). There is no server, so
a shelf belongs to one browser on one device and the books themselves never
leave it. The one request that does go out is a cover lookup: a book with no
cover of its own has its ISBN sent to openlibrary.org to ask for a jacket, and
the answer is cached, so it is asked once.

Live at [paper.somfic.sh](https://paper.somfic.sh).

## Develop

```sh
bun install
bun run dev      # http://localhost:5174
bun run check    # svelte-check
bun run build    # static site → build/
```

## Deploy

`.github/workflows/deploy.yaml` builds on every push to `main` and pushes
`build/` to the `deploy` branch, which GitHub Pages serves. The custom
domain comes from `static/CNAME`.

Because Pages serves `404.html` for any path it has no file for, that is where
adapter-static writes the SPA shell — a deep link like `/book/3` boots the app
from there. `/` gets a real `index.html` via `prerender = true` in
`src/routes/+page.ts`.
