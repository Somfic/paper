<script lang="ts">
  import { Button, ColorInput, PopoverMenu } from "glow";
  import {
    AnnotationController,
    AnnotationKind,
  } from "$lib/reader/annotate.svelte";
  import type { ReaderController } from "$lib/reader/reader.svelte";

  let { reader }: { reader: ReaderController } = $props();

  const annotations = new AnnotationController();

  const items = $derived<PopoverMenuEntry[]>([
    { kind: "header", label: "Annotations" },
    {
      kind: "radio",
      options: [
        { value: String(AnnotationKind.highlight), label: "Highlight" },
        { value: String(AnnotationKind.ink), label: "Ink" },
      ],
      value: String(annotations.option.kind),
      onChange: (v) => {
        annotations.option = { ...annotations.option, kind: Number(v) };
      },
    },
    "divider",
    { kind: "custom", render: colorPicker },
    "divider",
    { kind: "custom", render: actions },
  ]);

  // Watch the book that is actually open; re-attaches if the route changes id.
  $effect(() => {
    const id = reader.book?.id;
    if (!reader.ready || id === undefined) return;
    return annotations.attach(reader);
  });

  $effect(() =>
    reader.onSection((doc, index) => annotations.observe(doc, index)),
  );
</script>

{#snippet colorPicker()}
  <div class="color-row">
    <span class="label">Color</span>
    <ColorInput
      value={annotations.option.color}
      onChange={(v) => {
        annotations.option = { ...annotations.option, color: v };
      }}
    />
  </div>
{/snippet}

{#snippet actions()}
  <div class="color-row">
    <Button icon="Undo" onclick={annotations.undo}>Undo</Button>
    <Button
      icon="Eraser"
      selected={annotations.erasing}
      onclick={() => (annotations.erasing = !annotations.erasing)}>Erase</Button
    >
    <Button icon="Check" onclick={() => (annotations.panelOpen = false)}
      >Done</Button
    >
  </div>
{/snippet}

<!-- Hidden entirely until the scan finds a cast worth browsing: a non-fiction
     book has no characters, and an empty panel is worse than no button. -->
<PopoverMenu {items} bind:open={annotations.panelOpen} align="right" offset={8}>
  {#snippet trigger()}
    <!-- the label would otherwise sit on top of the panel it opened -->
    <Button
      variant="ghost"
      icon="Highlighter"
      tooltip={annotations.panelOpen ? "" : "Annotations"}
    />
  {/snippet}
</PopoverMenu>

<style>
  .color-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
  }

  .label {
    font-size: 0.82rem;
  }
</style>
