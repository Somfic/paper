import * as library from "$lib/library";
import type { ReaderController } from "./reader.svelte";

export enum AnnotationKind {
  highlight,
  ink
}

export type AnnotationOption = {
  kind: AnnotationKind,
  color: string,
  width?: number,
}

export type Vec2 = { x: number, y: number }

// NOTE: subject to change based on later implementation of freehand ink support
export type Annotation = {
  id: number,
  bookId: number,
  kind: AnnotationKind, // magari piu nel futuro
  index: number,
  value: string, // Always a CFI string — for ink this anchors the stroke's origin point
  points: Vec2[] | null, // ink only: stroke points, relative to the anchor's bounding rect
  createdAt: Date
  option: AnnotationOption
}

/** Tolerate a failed read: a book with no annotations yet still opens fine. */
function loadAnnotations(bookId: number): Promise<Annotation[]> {
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
  #bookId = 0;
  #overlayer = $state<any>(null); // overlayer.js, once it lands offers draw methods
  #docs = new Map<Document, () => void>();
  #penDown: boolean = false;
  annotations: Annotation[] = [];
  sessionIds: number[] = [];

  option = $state<AnnotationOption>({ kind: AnnotationKind.highlight, color: "#ffeb3b" });
  panelOpen = $state(false);
  /** A mode, not a "kind" — nothing is being drawn while this is true. */
  erasing = $state(false);

  attach(reader: ReaderController) {
    this.#reader = reader;
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

    // drawing annotations
    this.#reader.view.addEventListener("relocate", this.#onRelocate);
    // erase mode: tapping an existing mark fires this for free
    this.#reader.view.addEventListener("show-annotation", this.#onShowAnnotation);

    // Erase mode must not survive the popover closing, however it closes
    // (Done, click-away, Escape) — a watch on panelOpen covers all of
    // those uniformly, since we don't get a callback for glow's own
    // click-away/Escape dismissal, only the bound `open` value changing.
    const disposeErase = $effect.root(() => {
      $effect(() => {
        if (!this.panelOpen) this.erasing = false;
      });
    });

    return () => {
      this.#reader.view.removeEventListener?.("relocate", this.#onRelocate);
      this.#reader.view.removeEventListener?.("show-annotation", this.#onShowAnnotation);
      disposeErase();
      this.#reader = null;
      this.annotations = [];
      this.sessionIds = [];
    }
  }

  // Given cursor pos finds range of closest element to anchor from
  #getRange(doc: Document, x: number, y: number): Range | undefined {
    // if (document.caretRangeFromPoint) {
    //   return document.caretRangeFromPoint(x, y);
    // }
    const carePosition = doc.caretPositionFromPoint(x, y);

    if (carePosition) {
      const range = doc.createRange();
      range.setStart(carePosition.offsetNode, carePosition.offset)
      range.collapse(true);
      return range;
    }
    return undefined;
  }
  // it returns the book content or the iframe
  #getContent(view: any, index: number): any {
    return view.renderer
      ?.getContents()
      ?.find((c: any) => c.index === index);

  }

  // ── selection tracking ─────────────────────────────────────────
  // lifted straight from quote.svelte.ts ngl heh heh 
  observe(doc: Document, index: number) {
    if (this.#docs.has(doc)) return;
    let svg: SVGElement | null = null;
    let currentPath: SVGPathElement | null = null;
    let offsets: Vec2[] = [];
    let anchorRect: Vec2 | null = null;
    let range: Range | undefined;

    const down = (event: PointerEvent) => {
      if (this.panelOpen && this.option.kind == AnnotationKind.ink) {
        this.#penDown = true;

        range = this.#getRange(doc, event.clientX, event.clientY)
        const rect = range?.getBoundingClientRect();

        if (!rect) return;

        anchorRect = { x: rect.x, y: rect.y };
        const content = this.#getContent(this.#reader.view, index);

        svg = content.overlayer.element;
        currentPath = this.#createPathElement(this.option)
        svg?.appendChild(currentPath);
      }
    }

    const move = (event: PointerEvent) => {
      if (this.panelOpen && this.option.kind == AnnotationKind.ink && this.#penDown) {
        if (!anchorRect) return;
        const currentD = currentPath?.getAttribute('d') || '';
        const command = currentD === '' ? 'M' : 'L';

        if (!currentPath) return;

        currentPath.setAttribute('d', `${currentD}${command} ${event.clientX} ${event.clientY}`);
        offsets.push({ x: event.clientX - anchorRect.x, y: event.clientY - anchorRect.y })
      }
    }

    const up = async () => {
      this.#penDown = false;
      if (this.erasing || !this.panelOpen) return;

      const view = this.#reader?.view;

      if (!view) {
        console.warn("Annotations: failed drawing annotation but was saved to ")
        return;
      }

      if (this.option.kind === AnnotationKind.highlight) {
        const sel = doc.getSelection();
        if (!sel || sel.toString().length === 0 || sel.rangeCount === 0) return;
        range = sel.getRangeAt(0);
      } else if (this.option.kind === AnnotationKind.ink) {
        if (!range || offsets.length === 0) return;
      }

      const cfi = view.getCFI(index, range)
      const draft: Omit<Annotation, "id"> = {
        index,
        value: cfi,
        points: this.option.kind === AnnotationKind.ink ? offsets : null,
        bookId: this.#bookId,
        kind: this.option.kind,
        option: { ...this.option },
        createdAt: new Date()
      }

      const annotationId = await library.putAnnotation(draft);
      this.annotations.push({ id: annotationId, ...draft });
      this.sessionIds.push(annotationId);

      if (this.option.kind === AnnotationKind.highlight) this.#drawHighlight(view, annotationId, cfi, this.option);
      // if (this.option.kind === AnnotationKind.ink) this.#drawInk(view, annotationId, cfi, this.option, points);

      console.log(`Annotations: annotation was added ${annotationId} and draw succesfully`)
      svg = null;
      currentPath = null;
      offsets = [];
      anchorRect = null;
    }



    doc.addEventListener("pointerdown", down);
    doc.addEventListener("pointermove", move);
    doc.addEventListener("pointerup", up);
    this.#docs.set(doc, () => {
      doc.removeEventListener("pointerdown", down);
      doc.removeEventListener("pointerup", up);
      doc.removeEventListener("pointermove", move);
    });

  }
  undo = async () => {
    const id = this.sessionIds.pop();
    if (id) await this.#erase(id);
  }

  /** Erase mode: tapping an existing mark deletes it. `show-annotation`
   *  already fires with the tapped key for any drawn overlayer entry, so
   *  there's no hit-testing to write ourselves. */
  #onShowAnnotation = async (e: any) => {
    if (!this.erasing) return;
    const id = Number(e.detail?.value);
    if (!Number.isNaN(id)) await this.#erase(id);
  }

  /** The one place undo and the eraser both end up: drop the row from the
   *  db, drop it from the in-memory list, take its mark off the page. */
  async #erase(id: number) {
    const index = this.annotations.findIndex((a) => a.id === id);
    if (index === -1) return;
    const [annotation] = this.annotations.splice(index, 1);
    await library.deleteAnnotation(id);
    this.#eraseDrawing(annotation.value, id);
  }


  // arrow function to solve weird "this" bug
  #onRelocate = () => {
    const view = this.#reader?.view;

    if (!view) {
      console.warn("Annotations: failed loading annotations")
      return;
    }

    for (let { id, value, option, kind, points } of this.annotations) {

      switch (kind) {
        case AnnotationKind.highlight:
          this.#drawHighlight(view, id, value, option)
          break;
        case AnnotationKind.ink:
          this.#drawInk(view, id, value, option, points)
          break;
        default:
          console.warn("Annotations: Non e sucesso un cazzo")
      }
    }
  }

  #drawHighlight(view: any, id: number, cfi: string, option: AnnotationOption) {
    const { index, anchor } = view.resolveCFI(cfi);

    const content = this.#getContent(view, index);
    if (!content?.overlayer) return;

    const range = anchor(content.doc);
    content.overlayer.add(id.toString(), range, this.#overlayer.highlight, option)
  }

  #drawInk(view: any, id: number, cfi: string, options: AnnotationOption, points: Vec2[] | null) {
    if (!points || points.length === 0) return;

    const { index, anchor } = view.resolveCFI(cfi);

    const content = this.#getContent(view, index);

    if (!content?.overlayer) return;

    const range = anchor(content.doc);
    const rect = range.getBoundingClientRect();
    const el = this.#createPathElement(options, points, rect)
    content.overlayer.element.appendChild(el);
  }

  #createPathElement(options: AnnotationOption, points: Vec2[] = [], rect: Vec2 = { x: 0, y: 0 }): SVGPathElement {

    const d = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${rect.x + p.x} ${rect.y + p.y}`)
      .join(' ');

    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", options.color);
    el.setAttribute("stroke-width", String(options.width ?? 3));
    el.setAttribute("d", d);
    return el;

  }

  #eraseDrawing(cfi: string, id: number) {
    const view = this.#reader?.view;
    if (!view) return;
    const { index } = view.resolveCFI(cfi);
    const content = view.renderer?.getContents()?.find((c: any) => c.index === index);
    content?.overlayer?.remove(id.toString());
  }

}
