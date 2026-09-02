# tools

Driving the built app in a real browser: to assert that something works, and to
record the picture that shows it working.

```sh
node tools/scripts/cast.test.mjs              # build, then check the tracker
node tools/scripts/cast.test.mjs --no-build   # against the build already there
node tools/scripts/cast.demo.mjs out.gif      # record a GIF for a PR
bun  tools/scripts/cast-extract.mjs book.epub # the scan, no browser
```

Chrome comes from the machine, not from a download: the dependency is
`playwright-core`, whose install is a few hundred kilobytes, rather than
`playwright`, whose postinstall pulls a few hundred megabytes of browser
binaries that CI would then pay for on every run. `ffmpeg` is needed only to
assemble a GIF.

## harness/ — not specific to this app

| | |
|---|---|
| `launch()` | build → serve → open Chrome, and one `close()` that undoes all of it |
| `checks()` | one-line assertions, console-error capture, exit code |
| `recorder()` | a drawn pointer, captions, and frame-by-frame recording |
| `serve()` | a static site, served the way GitHub Pages serves it |
| `devServer()` | a `vite dev` (or any) server, waited for by its printed URL |

```js
const app = await launch({ build: true });          // this project's own build
const app = await launch({ dev: "bun run dev" });   // a dev server instead
const app = await launch({ url: "http://…:5173" }); // something already up

try { /* app.page is a playwright Page */ } finally { await app.close(); }
```

Three decisions worth keeping:

**Pages, not `vite preview`.** `serve()` answers an unknown path with `404.html`
*and a 404 status*, because that is what GitHub Pages does and what the app's own
404 page turns back into a route. A dev server that rewrites unknown paths to
`index.html` tests something the live site never does.

**Screenshots, not video.** Playwright records video, and its timing is not
linear — the same script trimmed to "the last four seconds" caught a different
moment every run. `recorder()` takes frames at the moment the script says so and
hands them to ffmpeg; a held beat is the same frame written N times.

**A drawn pointer.** A real cursor is not in a screenshot, so a demo without one
is a series of things happening for no visible reason.

## paper/ — specific to this app

`reader.mjs` drives the reader: `addBook`, `openBook`, `turn`, `locate`,
`clickText`, `stored`, `record`, `waitForCast`, `forgetPosition`.

`locate(page, "Roberts")` is the one worth knowing about. The prose renders
inside foliate's nested iframes, so a rect from in there needs the frame's own
offset folded in before you can click it — and foliate lays a section out as
columns and translates them, so the pages you have already read are still in the
DOM, off to the left. The first match for a common word is very often at a
negative x. `locate` only ever returns somewhere you could actually click.

`epub.mjs` writes an epub (a zip writer in 60 lines, no dependency) and reads
one back — including real books, which is what makes the offline probe useful.
`fixtures.mjs` holds two books written for the character scan: a Dutch one whose
function words carry mid-sentence capitals and whose genitive has no apostrophe,
and an English one where `Robert` and `Roberts` are two different people and
have to stay that way.

Fixtures are prose rather than word salad on purpose. Every heuristic in the
scan reads sentence shape — where the capitals fall, what follows a preposition,
which words the book also uses in lower case — and random nouns exercise none
of it.

## Writing another one

```js
import { launch } from "../harness/app.mjs";
import { checks } from "../harness/check.mjs";

const t = checks("what this is about");
const app = await launch({ build: true });
t.watch(app.page);
try {
  t.ok("it did the thing", await app.page.locator(".thing").isVisible());
} finally {
  await app.close();
}
t.done();
```

Assert properties of the feature, not of the fixture, so the script survives the
next change to it. And always close in a `finally` — a leaked Chrome holds the
port, and the next run will not tell you why it is hanging.
