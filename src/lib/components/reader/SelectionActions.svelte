<script lang="ts">
  import { fade, slide } from "svelte/transition";
  import { Button, RangeInput } from "glow";
  import type { ReaderController } from "$lib/reader/reader.svelte";
  import { QuoteCards, REFUSE_CHARS } from "$lib/reader/quote.svelte";
  import { AnnotationController, type Vec2 } from "$lib/reader/annotate.svelte";

  // Keeps a pill's anchor point on screen: `padX` is roughly the pill's own
  // half-width so it doesn't run past an edge, y just stays clear of the header.
  function clampToViewport(x: number, y: number, padX: number) {
    return {
      x: Math.min(Math.max(x, padX), window.innerWidth - padX),
      y: Math.max(y, 56),
    };
  }

  let { reader }: { reader: ReaderController } = $props();

  const quotes = new QuoteCards();
  const annotations = new AnnotationController();

  let optionsOpen = $state(false);

  // A fresh (or cleared) selection should collapse the color/width drawer,
  // and drop any mark-click pill, rather than carry either over onto
  // whatever text comes next.
  $effect(() => {
    quotes.anchor;
    optionsOpen = false;
    annotations.pendingErase = null;
  });

  // Selections happen inside each section's iframe; the controller hands us
  // every document as it renders.
  $effect(() => {
    const off = reader.onSection((doc, index) => quotes.observe(doc, index));
    return () => {
      off();
      quotes.dispose();
    };
  });

  // Watches the book that is actually open; re-attaches if the route changes id.
  $effect(() => {
    const id = reader.book?.id;
    if (!reader.ready || id === undefined) return;
    annotations.attach(reader);
  });

  // A page turn leaves the action floating over unrelated text.
  $effect(() => {
    reader.fraction;
    quotes.dismiss();
  });

  // Ink needs pointerdown/drag on the page itself to draw — don't let that
  // gesture dismiss the pill the way an ordinary click-elsewhere would.
  $effect(() => {
    quotes.hold = annotations.isInkCapture;
  });

  // Keep the pill on screen when the passage starts at an edge.
  const pill = $derived.by(() => {
    const a = quotes.anchor;
    return a ? clampToViewport(a.x, a.y, 60) : null;
  });

  // One anchor holds at most one annotation — a settled selection that lands
  // on an existing one offers to delete it instead of creating a second.
  const claimedId = $derived.by(() => {
    quotes.anchor;
    const target = quotes.target();
    if (!target) return null;
    return annotations.annotationAt(target.index, target.range);
  });

  // A direct click on a drawn mark (annotate.svelte.ts wires this up) opens
  // a trash-only pill at the click point — no Quote button, nothing to do
  // here but delete.
  const erasePill = $derived.by(() => {
    const pending = annotations.pendingErase;
    return pending ? clampToViewport(pending.point.x, pending.point.y, 10) : null;
  });

  function create() {
    quotes.render({
      title: reader.displayTitle,
      author: reader.metaAuthor,
      theme: reader.theme,
    });
  }

  async function highlight() {
    const target = quotes.target();
    if (!target) return;
    await annotations.highlightSelection(target.index, target.range);
    quotes.dismiss();
  }

  function ink() {
    annotations.isInkCapture = true;
    const target = quotes.target();
    if (!target) return;
    if (!quotes.doc) return;
    annotations.inkSelection(quotes.doc, target.index, target.range);
  }

  async function remove() {
    if (claimedId === null) return;
    await annotations.removeAnnotation(claimedId);
    quotes.dismiss();
  }

  async function eraseMark() {
    const id = annotations.pendingErase?.id;
    annotations.pendingErase = null;
    if (id !== undefined) await annotations.removeAnnotation(id);
  }
</script>

<svg class="annotationFeedback">
  {#each annotations.option.points as points}
    <path
      d={AnnotationController.parsePointsToPath(
        points,
        annotations.pageAnchor as Vec2,
      )}
      fill={"none"}
      stroke={annotations.option.color}
      stroke-width={String(annotations.option.width ?? 3)}
    />
  {/each}
</svg>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== "Escape") return;
    if (quotes.open) quotes.close();
    annotations.pendingErase = null;
  }}
  onclick={() => (annotations.pendingErase = null)}
/>

{#if erasePill}
  <div
    class="ink-pill"
    style="left:{erasePill.x}px;top:{erasePill.y}px"
    transition:fade={{ duration: 130 }}
  >
    <div class="row">
      <Button
        variant="ghost"
        shape="circle"
        icon="Trash2"
        tooltip="Remove annotation"
        onclick={eraseMark}
      />
    </div>
  </div>
{/if}

{#if pill && !quotes.open}
  <div
    class="ink-pill"
    class:expanded={optionsOpen}
    style="left:{pill.x}px;top:{pill.y}px"
    transition:fade={{ duration: 130 }}
  >
    <div class="row">
      <button class="quote" onclick={create}>
        <span aria-hidden="true">“</span> Quote
      </button>
      <span class="divider" aria-hidden="true"></span>
      {#if claimedId !== null}
        <Button
          variant="ghost"
          shape="circle"
          icon="Trash2"
          tooltip="Remove annotation"
          onclick={remove}
        />
      {:else}
        <button
          class="swatch-trigger"
          style="background:{annotations.option.color}"
          aria-label="Color & width"
          aria-expanded={optionsOpen}
          onclick={() => (optionsOpen = !optionsOpen)}
        ></button>
        {#if !annotations.isInkCapture}
          <Button
            variant="ghost"
            shape="circle"
            icon="Highlighter"
            tooltip="Highlight"
            onclick={highlight}
          />
          <Button
            variant="ghost"
            shape="circle"
            icon="PenLine"
            tooltip="Ink"
            onclick={ink}
          />
        {:else}
          <Button
            variant="ghost"
            shape="circle"
            icon="TicketCheck"
            tooltip="Complete"
            onclick={() => {
              annotations.isInkCapture = false;
            }}
          />
        {/if}
      {/if}
    </div>
    {#if optionsOpen && claimedId === null}
      <div class="row options" transition:slide={{ duration: 130 }}>
        <div class="swatches">
          {#each annotations.frequentColors as c (c)}
            <button
              class="swatch"
              class:active={annotations.option.color === c}
              style="background:{c}"
              aria-label="Use {c}"
              onclick={() => (annotations.option.color = c)}
            ></button>
          {/each}
          <label
            class="custom-swatch"
            style="background:{annotations.option.color}"
          >
            <input
              type="color"
              aria-label="Custom color"
              bind:value={annotations.option.color}
            />
          </label>
        </div>
        <RangeInput
          bind:value={annotations.option.width}
          min={1}
          max={12}
          step={1}
        />
      </div>
    {/if}
  </div>
{/if}

{#if quotes.open}
  <div class="overlay" transition:fade={{ duration: 130 }}>
    <button class="backdrop" aria-label="Close" onclick={() => quotes.close()}
    ></button>
    <div class="panel" role="dialog" aria-label="Quote card">
      {#if quotes.tooLong}
        <p class="message">
          That selection is {quotes.length.toLocaleString("en-US")} characters — far
          more than a card can hold. Pick a passage under {REFUSE_CHARS.toLocaleString(
            "en-US",
          )}.
        </p>
      {:else if quotes.busy}
        <p class="message">Drawing the card…</p>
      {:else if quotes.url}
        <img class="preview" src={quotes.url} alt="The generated quote card" />
      {:else}
        <p class="message">{quotes.note || "The card could not be drawn."}</p>
      {/if}

      <div class="foot">
        <span class="hint">
          {#if quotes.note && quotes.url}
            {quotes.note}
          {:else if quotes.truncated}
            Trimmed to fit the card.
          {:else if quotes.url}
            1080 × 1080 PNG
          {/if}
        </span>
        {#if quotes.url}
          <Button
            variant="ghost"
            icon="Copy"
            label="Copy"
            onclick={() => quotes.copy()}
          />
          <Button
            variant="ghost"
            icon="Download"
            label="Save"
            onclick={() => quotes.save()}
          />
        {/if}
        <Button variant="ghost" icon="X" onclick={() => quotes.close()} />
      </div>
    </div>
  </div>
{/if}

<style>
  svg {
    position: fixed;
    inset: 0;
    margin: 0px;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  /* floating selection actions, anchored to the start of the passage — one
     shell that grows downward to reveal color/width instead of popping a
     separate floating panel next to it. */
  .ink-pill {
    position: fixed;
    z-index: 20;
    transform: translate(-50%, calc(-100% - 10px));
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--chrome);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
    overflow: hidden;
    transition: border-radius 130ms ease;
  }
  .ink-pill.expanded {
    border-radius: 16px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.45rem;
  }
  .row.options {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    padding: 0.2rem 0.65rem 0.6rem;
    border-top: 1px solid var(--border);
  }
  .quote {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.22rem 0.4rem;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--fg);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .quote:hover {
    background: var(--bg);
  }
  .quote span {
    font-size: 1.1rem;
    line-height: 0.6;
    color: var(--dim);
  }
  .divider {
    width: 1px;
    height: 1.1rem;
    flex: 0 0 auto;
    background: var(--border);
  }
  .swatch-trigger {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid var(--border);
    cursor: pointer;
  }
  .swatch-trigger[aria-expanded="true"] {
    border-color: var(--fg);
  }
  .swatches {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .swatch {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
  }
  .swatch.active {
    border-color: var(--fg);
  }
  .custom-swatch {
    position: relative;
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px dashed var(--border);
    overflow: hidden;
    cursor: pointer;
  }
  .custom-swatch input[type="color"] {
    position: absolute;
    inset: -4px;
    width: calc(100% + 8px);
    height: calc(100% + 8px);
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 25;
    display: grid;
    place-items: center;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: rgba(0, 0, 0, 0.45);
    cursor: default;
  }
  .panel {
    position: relative;
    max-width: min(28rem, 92vw);
    padding: 0.9rem;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--chrome);
    color: var(--fg);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  }
  .preview {
    display: block;
    width: min(24rem, 76vw);
    height: auto;
    border-radius: 8px;
    border: 1px solid var(--border);
  }
  .message {
    width: min(24rem, 76vw);
    margin: 0;
    padding: 2.5rem 1rem;
    text-align: center;
    line-height: 1.5;
    color: var(--dim);
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.7rem;
  }
  .hint {
    flex: 1;
    min-width: 0;
    font-size: 0.75rem;
    color: var(--dim);
  }
</style>
