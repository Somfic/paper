import * as library from "$lib/library";
import type { ReaderController } from "./reader.svelte";
import { liftPoint } from "./quote.svelte";

// Turns a settled text selection into a highlight or a freehand ink stroke,
// drawn through foliate's Overlayer and persisted to IndexedDB. The model
// keeps one rule: an anchor holds at most one annotation, so creating one is
// only ever offered where none exists yet — see `annotationAt()`, which
// SelectionActions.svelte checks before choosing between Highlight/Ink and a
// delete affordance.

export enum AnnotationKind {
  highlight,
  ink,
}

export type AnnotationOption = {
  kind: AnnotationKind;
  color: string;
  width?: number;
  /** ink only — one array per drag/lift segment of the stroke */
  points?: Vec2[][];
};

export type Vec2 = { x: number; y: number };

export type Annotation = {
  id: number;
  bookId: number;
  kind: AnnotationKind;
  index: number;
  /** Always a CFI string — for ink this anchors the stroke's origin point */
  value: string;
  createdAt: Date;
  option: AnnotationOption;
};

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * An Overlayer draw function for a freehand ink stroke: one <path> per
 * drag/lift segment, in points relative to `anchor`.
 */
function drawInk(anchor: Vec2) {
  return (_rects: DOMRect[], options: AnnotationOption): SVGGElement | undefined => {
    if (!options.points?.length) return;
    const g = document.createElementNS(SVG_NS, "g");
    for (const path of options.points) {
      const el = document.createElementNS(SVG_NS, "path");
      el.setAttribute("fill", "none");
      el.setAttribute("stroke", options.color);
      el.setAttribute("stroke-width", String(options.width ?? 3));
      el.setAttribute("stroke-linecap", "round");
      el.setAttribute("stroke-linejoin", "round");
      el.setAttribute("d", AnnotationController.parsePointsToPath(path, anchor));
      g.append(el);
    }
    return g;
  };
}

/** Tolerate a failed read: a book with no annotations yet still opens fine. */
async function loadAnnotations(bookId: number): Promise<Annotation[]> {
  return library.annotations(bookId).catch((e) => {
    console.warn("annotations: failed to load from db -", e);
    return [];
  });
}

const OVERLAYER_URL = "/foliate-js/overlayer.js";
let overlayerModule: Promise<any> | null = null;
const loadOverlayer = (): Promise<any> =>
  (overlayerModule ??= import(/* @vite-ignore */ OVERLAYER_URL));

export class AnnotationController {
  // ── reactive state ─────────────────────────────────────────────
  annotations: Annotation[] = $state([]);
  option = $state<AnnotationOption>({
    kind: AnnotationKind.highlight,
    color: "#ffeb3b",
    width: 3,
  });
  isInkCapture = $state(false);
  /** anchorRect lifted into page coordinates, for overlays drawn outside the iframe */
  pageAnchor: Vec2 | null = $state(null);
  /** id + page-lifted point of a mark clicked directly on the page — the
   *  standalone trash-only pill (SelectionActions.svelte) reads this. */
  pendingErase = $state<{ id: number; point: Vec2 } | null>(null);

  // ── private refs ───────────────────────────────────────────────
  #reader: any = null;
  #view: any = null;
  #bookId = 0;
  #overlayer = $state<any>(null); // overlayer.js, once it lands offers draw methods
  sessionIds: number[] = [];

  // ── ink capture ────────────────────────────────────────────────
  static readonly #POLLING_RATE = 10; // px — offsets closer than this to the last one are dropped
  anchorRect: Vec2 | null = null; // iframe-local — matches the pointer events offsets are captured from
  offsets: Vec2[] = []; // the in-progress drag/lift segment of the current stroke

  // a handful of defaults so the swatch row isn't empty on a fresh book
  static readonly #DEFAULT_SWATCHES = [
    "#ffeb3b",
    "#4ade80",
    "#60a5fa",
    "#f87171",
    "#c084fc",
    "#fb923c",
  ];

  /** Colors already used in this book, most-used first, topped up with a few
   *  defaults — no separate palette store, just what has actually come up. */
  get frequentColors(): string[] {
    const counts = new Map<string, number>();
    for (const a of this.annotations) {
      counts.set(a.option.color, (counts.get(a.option.color) ?? 0) + 1);
    }
    const merged = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    for (const c of AnnotationController.#DEFAULT_SWATCHES) {
      if (!merged.includes(c)) merged.push(c);
    }
    return merged.slice(0, 6);
  }

  // ── lifecycle ──────────────────────────────────────────────────

  attach(reader: ReaderController) {
    this.#reader = reader;
    this.#view = reader?.view;
    if (!reader.book) {
      console.warn("Annotations: book not found");
      return;
    }
    this.#bookId = reader.book.id;
    loadAnnotations(this.#bookId).then((rows) => {
      this.annotations = rows;
    });

    loadOverlayer()
      .then((m) => {
        this.#overlayer = m.Overlayer;
      })
      .catch((e) => console.warn("annotations unavailable", e));

    this.#reader.view.addEventListener("relocate", this.#onRelocate);

    return () => {
      this.#reader.view.removeEventListener("relocate", this.#onRelocate);
      this.#reader = null;
      this.annotations = [];
      this.sessionIds = [];
    };
  }

  // ── selection → annotation ─────────────────────────────────────

  /** id of the annotation already anchored under a selection, or null —
   *  the enforcement point for "one anchor, one annotation." */
  annotationAt(index: number, range: Range): number | null {
    if (!this.#view) return null;
    const content = this.#getContent(this.#view, index);
    if (!content?.overlayer) return null;
    const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
    const [key] = content.overlayer.hitTest({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    return key === undefined ? null : Number(key);
  }

  /** Highlight a settled selection. Takes the range directly — the caller
   *  (the selection pill) has already validated it's non-empty and unclaimed. */
  async highlightSelection(index: number, range: Range) {
    if (!range || range.collapsed) return;
    if (this.annotationAt(index, range) !== null) return;
    this.option.kind = AnnotationKind.highlight;
    this.option.points = undefined;
    await this.#commit(index, range, AnnotationKind.highlight);
  }

  /** Capture a freehand stroke over a settled selection, then persist and
   *  draw it the same way a highlight is. */
  async inkSelection(document: Document, index: number, range: Range) {
    if (!range || range.collapsed) return;
    if (this.annotationAt(index, range) !== null) return;
    this.option.kind = AnnotationKind.ink;
    this.option.points = [];

    const rect = range.getBoundingClientRect();
    this.anchorRect = { x: rect.x, y: rect.y };
    this.pageAnchor = liftPoint(document, rect.x, rect.y);

    // Native text selection has to stay off only while the stroke is being
    // drawn — left on, it silently kills selecting on this page for good.
    document.body.style.userSelect = "none";
    try {
      await this.inkCapture(document);
    } finally {
      document.body.style.userSelect = "";
    }

    await this.#commit(index, range, AnnotationKind.ink);
  }

  /** Shared tail of both selection methods: resolve the CFI, write the row,
   *  draw the mark. */
  async #commit(index: number, range: Range, kind: AnnotationKind): Promise<number | null> {
    if (!this.#view) return null;
    const cfi = this.#view.getCFI(index, range);
    const option: AnnotationOption = { ...this.option, kind };
    const id = await this.#insertAnnotation(index, cfi, option);
    this.#draw(kind, this.#view, id, cfi, option);
    return id;
  }

  async inkCapture(document: Document): Promise<void> {
    return new Promise((res) => {
      const cleanup = $effect.root(() => {
        $effect(() => {
          if (this.isInkCapture) {
            document.addEventListener("pointermove", this.handleInkEvent);
            return () => document.removeEventListener("pointermove", this.handleInkEvent);
          } else {
            cleanup();
            res();
          }
        });
      });
    });
  }

  // arrow function to solve weird "this" bug (addEventListener strips the
  // instance binding off a plain method)
  handleInkEvent = (event: PointerEvent) => {
    if (!this.anchorRect) return;
    let diff = 100;
    const lastPoint = this.offsets.at(-1);
    if (lastPoint) diff = Math.hypot(lastPoint.x - event.clientX, lastPoint.y - event.clientY);

    if (event.buttons > 0 && diff > AnnotationController.#POLLING_RATE) {
      this.offsets.push({
        x: event.clientX - this.anchorRect.x,
        y: event.clientY - this.anchorRect.y,
      });
    } else if (this.offsets.length > 0) {
      this.option.points?.push(this.offsets);
      this.offsets = [];
    }
  };

  // ── persistence ────────────────────────────────────────────────

  async #insertAnnotation(index: number, cfi: string, option: AnnotationOption): Promise<number> {
    const draft: Omit<Annotation, "id"> = {
      index,
      value: cfi,
      bookId: this.#bookId,
      kind: option.kind,
      option,
      createdAt: new Date(),
    };
    // draft.option nests inside this.option, a $state proxy — put() can't
    // structured-clone a Proxy, so snapshot to plain data before it touches IndexedDB.
    const snapshot = $state.snapshot(draft);
    const id = await library.putAnnotation(snapshot);
    this.annotations.push({ id, ...snapshot });
    this.sessionIds.push(id);
    return id;
  }

  /** Drop the row from the db, drop it from the in-memory list, take its
   *  mark off the page. */
  async removeAnnotation(id: number) {
    const index = this.annotations.findIndex((a) => a.id === id);
    if (index === -1) return;
    const [annotation] = this.annotations.splice(index, 1);
    await library.deleteAnnotation(id);
    this.#eraseDrawing(annotation.value, id);
  }

  // ── drawing ────────────────────────────────────────────────────

  static parsePointsToPath(points: Vec2[], rect: Vec2): string {
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${rect.x + p.x} ${rect.y + p.y}`)
      .join(" ");
  }

  // the book content or the iframe that hosts the svg layer "Overlayer"
  #getContent(view: any, index: number): any {
    return view.renderer?.getContents()?.find((c: any) => c.index === index);
  }

  // kind → draw fn, so committing a new annotation and replaying one on
  // relocate both dispatch through the same table.
  #draw(kind: AnnotationKind, view: any, id: number, cfi: string, options: AnnotationOption) {
    if (kind === AnnotationKind.ink) this.#drawInk(view, id, cfi, options);
    else this.#drawHighlight(view, id, cfi, options);
  }

  // arrow function to solve weird "this" bug
  #onRelocate = () => {
    const view = this.#view;
    if (!view) {
      console.warn("Annotations: failed loading annotations");
      return;
    }
    for (const { id, value, option, kind } of this.annotations) {
      this.#draw(kind, view, id, value, option);
    }
  };

  #drawHighlight(view: any, id: number, cfi: string, options: AnnotationOption) {
    const { index, anchor } = view.resolveCFI(cfi);
    const content = this.#getContent(view, index);
    if (!content?.overlayer) return;
    const range = anchor(content.doc);
    const draw = (rects: DOMRect[], opts: AnnotationOption) => {
      const el = this.#overlayer.highlight(rects, opts);
      this.#makeErasable(el, id);
      return el;
    };
    content.overlayer.add(id.toString(), range, draw, options);
  }

  #drawInk(view: any, id: number, cfi: string, options: AnnotationOption) {
    const { index, anchor } = view.resolveCFI(cfi);
    const content = this.#getContent(view, index);
    if (!content?.overlayer) return;

    const range = anchor(content.doc);
    const rect = range.getBoundingClientRect();
    const inner = drawInk(rect);
    const draw = (rects: DOMRect[], opts: AnnotationOption) => {
      const el = inner(rects, opts);
      if (el) this.#makeErasable(el, id);
      return el;
    };
    content.overlayer.add(id.toString(), range, draw, options);
  }

  /** Overlayer's own <svg> is pointer-events:none so it never steals page
   *  clicks — a mark opts back in so a click on it opens the trash-only pill
   *  instead of the delete needing a text selection.
   *
   *  No coordinate lift needed here (unlike ink capture): the overlayer's
   *  <svg> is appended in the *top* document, absolutely positioned over the
   *  section's iframe (paginator.js), not inside the iframe itself — so a
   *  click on a mark already arrives in top-document coordinates. */
  #makeErasable(el: SVGElement, id: number) {
    el.style.pointerEvents = "auto";
    el.style.cursor = "pointer";
    el.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation();
      this.pendingErase = { id, point: { x: e.clientX, y: e.clientY } };
    });
  }

  #eraseDrawing(cfi: string, id: number) {
    const view = this.#reader?.view;
    if (!view) return;
    const { index } = view.resolveCFI(cfi);
    const content = view.renderer?.getContents()?.find((c: any) => c.index === index);
    content?.overlayer?.remove(id.toString());
  }
}
