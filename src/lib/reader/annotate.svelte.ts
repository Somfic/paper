import * as library from "$lib/library";
import type { ReaderController } from "./reader.svelte";
import { liftPoint } from "./quote.svelte";

export enum AnnotationKind {
  highlight,
  ink
}

export type AnnotationOption = {
  kind: AnnotationKind,
  color: string,
  width?: number,
  points?: Vec2[][], // only useful for injecting points into the draw ink system
}

export type Vec2 = { x: number, y: number }

// NOTE: subject to change based on later implementation of freehand ink support
export type Annotation = {
  id: number,
  bookId: number,
  kind: AnnotationKind, // magari piu nel futuro
  index: number,
  value: string, // Always a CFI string — for ink this anchors the stroke's origin point
  points: Vec2[][] | undefined, // ink only: stroke points, relative to the anchor's bounding rect
  createdAt: Date
  option: AnnotationOption
}

/** Tolerate a failed read: a book with no annotations yet still opens fine. */
async function loadAnnotations(bookId: number): Promise<Annotation[]> {
  return library.annotations(bookId).catch((e) => {
    console.warn("annotations: failed to load from db - ", e);
    return [];
  });
}

const OVERLAYER_URL = "/foliate-js/overlayer.js";
let overlayerModule: Promise<any> | null = null;
const loadOverlayer = (): Promise<any> =>
  (overlayerModule ??= import(/* @vite-ignore */ OVERLAYER_URL));


export class AnnotationController {
  #reader: any = null;
  #view: any = null;
  #bookId = 0;
  #overlayer = $state<any>(null); // overlayer.js, once it lands offers draw methods
  #offSection: (() => void) | null = null;

  annotations: Annotation[] = [];
  sessionIds: number[] = [];
  option = $state<AnnotationOption>({ kind: AnnotationKind.highlight, color: "#ffeb3b" });
  range: Range | undefined;

  // Ink States
  isInkCapture = $state(false);
  anchorRect: Vec2 | null = null; // iframe-local — matches the pointer events offsets are captured from
  pageAnchor: Vec2 | null = $state(null); // anchorRect lifted into page coordinates, for overlays drawn outside the iframe
  offsets: Vec2[] = []; // one contiunous flow of the ink / one path of g
  static readonly #POLLINGRATE = 10;
  // Highlight States

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
    }
  }

  // it returns the book content or the iframe that hosts the svg layer "Overlayer"
  #getContent(view: any, index: number): any {
    return view.renderer
      ?.getContents()
      ?.find((c: any) => c.index === index);
  }

  static parsePointsToPath(points: Vec2[], rect: Vec2) {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${rect.x + p.x} ${rect.y + p.y}`)
      .join(' ');
  }

  async inkSelection(document: Document, index: number, range: Range) {
    // this.offsets = [];
    this.option.kind = AnnotationKind.ink;
    document.body.style.userSelect = "none";

    if (!range || range.collapsed) return;
    const rect = range?.getBoundingClientRect();


    console.log(rect);
    if (!rect) return;
    this.anchorRect = { x: rect.x, y: rect.y };
    this.pageAnchor = liftPoint(document, rect.x, rect.y);

    this.option.points = [];
    await this.inkCapture(document);

    if (!this.#view) return;
    const cfi = this.#view.getCFI(index, range)
    const option: AnnotationOption = { ...this.option, kind: AnnotationKind.ink };
    const annotationId = await this.insertAnnotationToDB(index, cfi, option)
    this.#drawInk(this.#view, annotationId, cfi, option)
  }

  async inkCapture(document: Document): Promise<void> {
    return new Promise((res, _) => {
      const cleanup = $effect.root(() => {
        $effect(() => {
          if (this.isInkCapture) {
            document.addEventListener("pointermove", this.handleInkEvent);
            return () => document.removeEventListener("pointermove", this.handleInkEvent);
          }
          else {
            cleanup();
            res();
          }
        })
      })
    })
  }

  // arrow function to solve weird "this" bug (addEventListener strips the
  // instance binding off a plain method)
  handleInkEvent = (event: PointerEvent) => {
    if (!this.anchorRect) return;
    // NOTE: ensure points are relayed at equal intervals of distance (maybe time?)
    let diff = 100;
    const lastPoint = this.offsets.at(-1);

    if (lastPoint) {
      const { x, y } = lastPoint;
      diff = Math.sqrt((x - event.clientX) ** 2 + (y - event.clientY) ** 2)
    }

    if (event.buttons > 0 && diff > AnnotationController.#POLLINGRATE) this.offsets.push({ x: event.clientX - this.anchorRect.x, y: event.clientY - this.anchorRect.y })
    else if (this.offsets.length > 0) {
      this.option.points?.push(this.offsets);
      this.offsets = [];
    }
  }

  /** Highlight a settled selection. Takes the range directly — the caller
   *  (the selection pill) has already validated it's non-empty. */
  async highlightSelection(index: number, range: Range) {
    this.option.kind = AnnotationKind.highlight;
    if (!range || range.collapsed) return;

    if (!this.#view) {
      console.warn("Annotations: view wasn't received")
      return;
    }

    const cfi = this.#view.getCFI(index, range)
    const option: AnnotationOption = { ...this.option, kind: AnnotationKind.highlight };
    const annotationId = await this.insertAnnotationToDB(index, cfi, option);
    this.#drawHighlight(this.#view, annotationId, cfi, option);
  }

  async insertAnnotationToDB(index: number, cfi: string, option: AnnotationOption) {
    const points = option.kind === AnnotationKind.ink ? this.option.points : undefined;
    const draft: Omit<Annotation, "id"> = {
      index,
      value: cfi,
      points,
      bookId: this.#bookId,
      kind: option.kind,
      option: { ...option, points },
      createdAt: new Date()
    }

    // draft.option.points nests inside this.option, a $state proxy — put()
    // can't structured-clone a Proxy, so snapshot to plain data first.
    const annotationId = await library.putAnnotation($state.snapshot(draft));

    console.log(annotationId);

    this.annotations.push({ id: annotationId, ...draft });
    this.sessionIds.push(annotationId);

    console.log(draft);

    return annotationId;
  }

  /** 
   * User needs to know visually when an ink annotation is anchored to a specific bit of text.
   * This information can be relayed to the user by potentially altering every text anchor for "ink" annotations
   * */
  #onShowAnnotation = async (e: any) => {

  }

  /** The one place undo and the eraser both end up: drop the row from the
   *  db, drop it from the in-memory list, take its mark off the page. */
  async #removeAnnotation(id: number) {
    const index = this.annotations.findIndex((a) => a.id === id);
    if (index === -1) return;
    const [annotation] = this.annotations.splice(index, 1);
    await library.deleteAnnotation(id);
    this.#eraseDrawing(annotation.value, id);
  }


  // arrow function to solve weird "this" bug
  #onRelocate = () => {
    const view = this.#view;

    if (!view) {
      console.warn("Annotations: failed loading annotations")
      return;
    }

    for (let { id, value, option, kind, points } of this.annotations) {
      console.log(value)
      switch (kind) {
        case AnnotationKind.highlight:
          console.log("we're in here")
          this.#drawHighlight(view, id, value, option)
          break;
        case AnnotationKind.ink:
          this.#drawInk(view, id, value, { ...option, points: points ?? [] })
          break;
        default:
          console.warn("Annotations: Non e sucesso un cazzo")
      }
    }
  }

  #drawHighlight(view: any, id: number, cfi: string, options: AnnotationOption) {
    const { index, anchor } = view.resolveCFI(cfi);

    const content = this.#getContent(view, index);
    if (!content?.overlayer) return;
    console.log("didn't survive this")
    const range = anchor(content.doc);
    content.overlayer.add(id.toString(), range, this.#overlayer.highlight, options)
  }

  #drawInk(view: any, id: number, cfi: string, options: AnnotationOption) {

    const createSVGElement = (tag: string) =>
      document.createElementNS('http://www.w3.org/2000/svg', tag)

    const customDrawFn = (rects: DOMRect[], options: AnnotationOption): any => {
      console.log(options.points)
      if (!options.points) return;
      const g = createSVGElement("g");
      for (let path of options.points) {
        const el = createSVGElement("path")
        el.setAttribute("fill", "none");
        el.setAttribute("stroke", options.color);
        el.setAttribute("stroke-width", String(options.width ?? 3));
        // NOTE: process contiguous runs in points and group them together in one element 
        if (!options.points || options.points.length == 0) return el;
        const d = AnnotationController.parsePointsToPath(path, rect);
        el.setAttribute("d", d);
        g.appendChild(el)
      }
      return g;
    }

    const { index, anchor } = view.resolveCFI(cfi);

    const content = this.#getContent(view, index);
    if (!content?.overlayer) return;

    const range = anchor(content.doc);
    const rect = range.getBoundingClientRect();

    console.log("I was here")
    content.overlayer.add(id.toString(), range, customDrawFn, options);
  }
  #eraseDrawing(cfi: string, id: number) {
    const view = this.#reader?.view;
    if (!view) return;
    const { index } = view.resolveCFI(cfi);
    const content = view.renderer?.getContents()?.find((c: any) => c.index === index);
    content?.overlayer?.remove(id.toString());
  }

}
