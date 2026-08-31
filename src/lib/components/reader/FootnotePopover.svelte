<script lang="ts">
	import type { FootnoteController } from "$lib/reader/footnotes.svelte";

	let { footnotes }: { footnotes: FootnoteController } = $props();

	let root = $state<HTMLDivElement>();
	let host = $state<HTMLDivElement>();

	// Stays mounted while closed: foliate sizes the note's view from its
	// container, so the box has to have layout before the note renders into it.
	$effect(() => {
		if (root && host) footnotes.register(root, host);
	});

	const box = $derived(footnotes.box);
	const label = $derived(footnotes.kind ? footnotes.kind : "note");
</script>

<div
	bind:this={root}
	class="footnote"
	class:open={footnotes.open}
	class:above={box.above}
	role="dialog"
	aria-label="Note"
	aria-hidden={!footnotes.open}
	inert={!footnotes.open}
	style="left:{box.left}px;top:{box.top}px;width:{box.width}px;height:{box.height}px;--caret:{box.caret}px;"
>
	<div class="bar">
		<span class="kind">{label}</span>
		<button class="close" onclick={footnotes.dismiss} aria-label="Close note"
			>✕</button
		>
	</div>
	<div class="note" bind:this={host}>
		{#if footnotes.pending}<span class="pending">Loading…</span>{/if}
	</div>
	<span class="caret" aria-hidden="true"></span>
</div>

<style>
	.footnote {
		position: fixed;
		z-index: 20;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--chrome);
		color: var(--fg);
		box-shadow:
			0 12px 32px rgba(0, 0, 0, 0.26),
			0 2px 6px rgba(0, 0, 0, 0.14);
		/* hidden but still laid out — see the effect above */
		visibility: hidden;
		opacity: 0;
		pointer-events: none;
		transition:
			opacity 0.12s ease,
			transform 0.12s ease;
		transform: translateY(-3px);
	}
	.footnote.above {
		transform: translateY(3px);
	}
	.footnote.open {
		visibility: visible;
		opacity: 1;
		pointer-events: auto;
		transform: none;
	}
	.bar {
		flex: 0 0 auto;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.25rem 0 0.6rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.close {
		border: none;
		background: transparent;
		color: var(--dim);
		font-size: 0.8rem;
		line-height: 1;
		padding: 0.3rem 0.4rem;
		border-radius: 6px;
		cursor: pointer;
	}
	.close:hover {
		color: var(--fg);
		background: var(--surface);
	}
	.note {
		position: relative;
		flex: 1;
		min-height: 0;
		border-radius: 0 0 9px 9px;
		background: var(--bg);
		overflow: hidden; /* the note's own view scrolls inside this */
	}
	.pending {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: 0.8rem;
		color: var(--dim);
	}
	/* little pointer at the reference the note belongs to */
	.caret {
		position: absolute;
		left: var(--caret);
		width: 9px;
		height: 9px;
		margin-left: -5px;
		background: var(--chrome);
		border: 1px solid var(--border);
		transform: rotate(45deg);
	}
	.footnote:not(.above) .caret {
		top: -5px;
		border-right: none;
		border-bottom: none;
	}
	.footnote.above .caret {
		bottom: -5px;
		background: var(--bg);
		border-left: none;
		border-top: none;
	}
</style>
