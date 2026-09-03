# paper

An epub reader that runs entirely in the browser. Books are added from your
machine or picked from a catalogue of public-domain ones, stored in IndexedDB,
and rendered with [foliate-js](https://github.com/johnfactotum/foliate-js). There
is no server, so a shelf belongs to one browser on one device and a book of your
own never leaves it.

Three requests do go out, all of them optional and none of them carrying
anything about you:

- **a cover lookup** — a book with no cover of its own has its ISBN sent to
  openlibrary.org to ask for a jacket. The answer is cached, so it is asked once.
- **the catalogue** — `static/catalog.json`, fetched from paper's own origin the
  first time the browse panel is opened.
- **a book** — picked from that panel, downloaded straight from
  standardebooks.org to your browser.

Live at [paper.somfic.sh](https://paper.somfic.sh).

## Browsing

Adding a book normally means finding a file for it. The browse panel is the
other way in: ~1,500 public-domain books from
[Standard Ebooks](https://standardebooks.org), added to your shelf in one click.

It works without a server because of one fact — Standard Ebooks serves its epubs
with `Access-Control-Allow-Origin: *`, so the browser is allowed to read the
download. Almost nowhere else does. Project Gutenberg, the Internet Archive and
Wikisource all serve their epubs without the header, and a browser refuses a
response it isn't permitted to read, so reaching them would need a proxy paper
doesn't have. (The Internet Archive is the near miss: it sends the header on
`.txt` but not on `application/epub+zip`.)

The catalogue itself is HTML across ~32 listing pages, which is no thing to make
a phone walk, so `scripts/catalog.ts` walks it at build time — where cross-origin
rules don't apply — into `static/catalog.json`:

```sh
bun run catalog
```

That file is committed, so dev and an offline build both have a catalogue, just
an older one. CI refreshes it before every deploy and is allowed to fail doing
so; a deploy is not worth blocking on someone else's uptime.

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
