# Ink annotation — rewrite plan

The previous ink implementation (uncommitted, written by Claude) was stashed
instead of committed — see `git stash list` for `"ink feature WIP (pre-rewrite
reference)"`. This doc is the plan for rewriting it by hand.

## What the old code was actually doing

Ink annotation = "let the user draw a freehand squiggle on the page, and have
it survive the book reflowing/resizing." That reflow part is the whole reason
it's harder than highlighting. A highlight anchors to a text `Range`, and
`Range.getClientRects()` automatically gives fresh rectangles after reflow. A
pen stroke isn't text — there's no built-in "range" for a doodle — so you have
to invent your own anchor and your own way to remap the drawing onto it after
things move.

The old approach: sample ~8 points along the stroke → hit-test each against
the actual text using `caretPositionFromPoint`/`caretRangeFromPoint` → if it
landed on text, build a text Range from the min/max hit offsets → store the
stroke's points normalized 0..1 inside that Range's bounding box → on redraw,
remap those 0..1 points into wherever that box currently is. If the stroke
didn't touch any text (drawn over an image/margin), it fell back to anchoring
against the whole page instead.

## Step-by-step

**Step 1 — Just get a line on screen (no persistence, no anchoring, throwaway)**
- Listen for `pointerdown` / `pointermove` / `pointerup` on the reader's iframe document.
- While dragging, push `[x, y]` points into an array.
- Draw them into an SVG `<path>` with `d="M x y L x y L x y..."`.
- Google: **Pointer Events API**, **SVG path d attribute**, `setPointerCapture` (keeps the drag working even if the pointer leaves the element).
- Checkpoint: you can scribble on the page and see it, even if it vanishes on refresh/scroll.

**Step 2 — Decide your anchor strategy (the actual hard decision)**
Pick one before writing more code:
- **Simple (recommended for barebones):** anchor every stroke to the current page/section's bounding box (`doc.body.getBoundingClientRect()`). No text hit-testing at all. Less "smart," way less code, ships today.
- **Fancy (what the old code did):** hit-test the stroke against text so it anchors to a CFI like highlights do. Needs `caretPositionFromPoint`/`caretRangeFromPoint` plus this project's existing `flattenSection`/`flatOffset`/`flatRange` helpers in `characters.ts` to turn DOM hits into a text `Range`.

Start simple. You can always upgrade to text-anchoring later once the dumb version works.

**Step 3 — Normalize points so they survive resize**
- Whatever box you anchor to (page box or text-range box), convert your raw pixel points into 0..1 fractions of that box's width/height *at draw time*.
- On redraw, multiply back by the box's *current* width/height/position.
- This is the trick that makes reflow-safety work — store relative position, not absolute pixels.

**Step 4 — Plug into the existing `Overlayer` machinery**
- Look at `static/foliate-js/overlayer.js` — `Overlayer.add(key, range, drawFn, options)` and `.redraw()`. It calls `range.getClientRects()` to get rects, then `drawFn(rects, options)` to get an SVG element back. It doesn't care what `range` "really" is — it just needs something with a `.getClientRects()` method.
- So if you're doing the simple anchor: make a tiny fake object `{ getClientRects: () => [doc.body.getBoundingClientRect()] }` and pass that as `range`.
- Your `drawFn(rects, options)` takes the current box (from those rects) + your stored normalized points, remaps them, and returns an SVG `<path>`.
- This is the piece that makes "redraw on resize" free — you don't have to listen for resize yourself, `Overlayer.redraw()` already gets called somewhere for highlights; ink rides the same path.

**Step 5 — Persist it**
- Look at how highlights get saved via `library.putAnnotation` / IndexedDB (`src/lib/library/index.ts`). Same store, just add a `points` field and reuse `kind: "ink"`.
- Store: which section/page it's on, the normalized points, the color/width, and (if you did the fancy anchor) the CFI.

**Step 6 — Undo / erase**
- Mirror however highlight erase works: remove from array, delete from DB, call `overlayer.remove(id)`.

**Step 7 — Wire up the UI**
- `AnnotationMenu.svelte` already has an "Ink" radio option (currently disabled) and a color picker. Enable it, add a stroke-width control if you want one.

## Things to Google as you go
- **Pointer Events** (down/move/up, `setPointerCapture`)
- **SVG path `d` syntax** (`M`, `L`; later maybe quadratic curves for smoother lines)
- **`caretPositionFromPoint` / `caretRangeFromPoint`** — only if you go the fancy text-anchoring route
- **Normalizing coordinates to a bounding box** (general pattern, not epub-specific) — this is the "store relative, not absolute" trick
- **Point thinning / min-distance sampling** so a slow drag doesn't generate thousands of points (simple `distance >= N px` check is enough)
- **Svelte 5 runes** (`$state`) since this codebase's controllers use them for reactivity

## Opinion
Skip the CFI/text-hit-testing part on the rewrite unless ink specifically
needs to feel "attached to the sentence." Page-box anchoring gets ~90% of the
feature for ~20% of the complexity, and it's the part most likely to cause
confusion later since it pulls in CFIs, flattened text offsets, and range math
all at once.
