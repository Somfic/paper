# paper

An epub reader that runs entirely in the browser. Books are added from your
machine, stored in IndexedDB, and rendered with
[foliate-js](https://github.com/johnfactotum/foliate-js). There is no server and
nothing is uploaded anywhere, which also means a shelf belongs to one browser on
one device.

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
