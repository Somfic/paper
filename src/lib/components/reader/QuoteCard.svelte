<script lang="ts">
  import { fade } from "svelte/transition";
  import { Button } from "glow";
  import type { ReaderController } from "$lib/reader/reader.svelte";
  import { QuoteCards, REFUSE_CHARS } from "$lib/reader/quote.svelte";
  import { AnnotationController } from "$lib/reader/annotate.svelte";

  let { reader }: { reader: ReaderController } = $props();

  const quotes = new QuoteCards();
  const annotations = new AnnotationController();

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
    if (!a) return null;
    const pad = 60;
    return {
      x: Math.min(Math.max(a.x, pad), window.innerWidth - pad),
      y: Math.max(a.y, 56),
    };
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
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape" && quotes.open) quotes.close();
  }}
/>

{#if pill && !quotes.open}
  <div
    class="pill-row"
    style="left:{pill.x}px;top:{pill.y}px"
    transition:fade={{ duration: 130 }}
  >
    <button class="pill" onclick={create}>
      <span aria-hidden="true">“</span> Quote
    </button>
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
  /* floating selection actions, anchored to the start of the passage */
  .pill-row {
    position: fixed;
    z-index: 20;
    transform: translate(-50%, calc(-100% - 10px));
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .pill {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.32rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--chrome);
    color: var(--fg);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  }
  .pill:hover {
    background: var(--bg);
  }
  .pill span {
    font-size: 1.1rem;
    line-height: 0.6;
    color: var(--dim);
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
