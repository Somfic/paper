<script lang="ts">
	import type { CharacterController } from "$lib/reader/characters.svelte";
	import CharacterCard from "./CharacterCard.svelte";

	let { characters }: { characters: CharacterController } = $props();

	const WIDTH = 340;
	const GAP = 10; // clearance between the name and the card
	const EDGE = 12; // keep-off from the viewport edges

	let root = $state<HTMLDivElement>();
	let height = $state(160);

	const open = $derived(characters.popover);
	const evidence = $derived(open ? characters.evidence(open.entry) : null);

	// Centred under the name, flipped above it when there is no room below, and
	// clamped to the viewport either way. Mirrors FootnotePopover's placement.
	const box = $derived.by(() => {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const width = Math.min(WIDTH, vw - 2 * EDGE);
		const r = open?.rect ?? {
			left: vw / 2,
			right: vw / 2,
			top: vh / 2,
			bottom: vh / 2,
		};
		const below = vh - r.bottom - GAP - EDGE;
		const above = r.top - GAP - EDGE;
		const flip = height > below && above > below;
		const left = Math.max(
			EDGE,
			Math.min((r.left + r.right) / 2 - width / 2, vw - width - EDGE),
		);
		return {
			width,
			left,
			top: flip ? Math.max(EDGE, r.top - GAP - height) : r.bottom + GAP,
			flip,
			caret: Math.max(14, Math.min((r.left + r.right) / 2 - left, width - 14)),
		};
	});

	// The card sizes to its own content, so the flip decision needs the height
	// it actually took.
	$effect(() => {
		characters.registerPopover(root ?? null);
		if (!root || !evidence) return;
		height = root.getBoundingClientRect().height;
	});
</script>

{#if open && evidence}
	<div
		bind:this={root}
		class="pop"
		class:above={box.flip}
		role="dialog"
		aria-label="About {evidence.name}"
		style="left:{box.left}px;top:{box.top}px;width:{box.width}px;--caret:{box.caret}px;"
	>
		<div class="bar">
			<span class="name">{evidence.name}</span>
			<button onclick={characters.dismiss} aria-label="Close">✕</button>
		</div>
		<div class="body">
			<CharacterCard {evidence} />
		</div>
		<span class="caret" aria-hidden="true"></span>
	</div>
{/if}

<style>
	.pop {
		position: fixed;
		z-index: 21;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--chrome);
		color: var(--fg);
		box-shadow:
			0 12px 32px rgba(0, 0, 0, 0.26),
			0 2px 6px rgba(0, 0, 0, 0.14);
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.4rem 0.35rem 0.4rem 0.7rem;
		border-bottom: 1px solid var(--border);
	}
	.name {
		font-weight: 600;
		font-size: 0.9rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bar button {
		border: none;
		background: transparent;
		color: var(--dim);
		font-size: 0.8rem;
		line-height: 1;
		padding: 0.3rem 0.4rem;
		border-radius: 6px;
		cursor: pointer;
	}
	.bar button:hover {
		color: var(--fg);
		background: var(--surface);
	}
	.body {
		padding: 0.6rem 0.7rem 0.7rem;
		max-height: 46vh;
		overflow-y: auto;
	}
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
	.pop:not(.above) .caret {
		top: -5px;
		border-right: none;
		border-bottom: none;
	}
	.pop.above .caret {
		bottom: -5px;
		border-left: none;
		border-top: none;
	}
</style>
