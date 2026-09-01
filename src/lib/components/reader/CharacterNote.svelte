<script lang="ts">
	// What you wrote about someone, under the pointer. Deliberately only the
	// note: everything the book itself says about them is a click away in the
	// card, and putting a paragraph of it under the pointer would mean the page
	// jumping at you every time you read across a name.
	//
	// glow's own tooltip would have been the obvious home for this, but it sets
	// `white-space: nowrap` — right for a button's label, wrong for a sentence
	// you wrote yourself — so the note gets a popover of its own instead.
	import type { CharacterController } from "$lib/reader/characters.svelte";
	import CharacterAnchor from "./CharacterAnchor.svelte";

	let { characters }: { characters: CharacterController } = $props();

	const hover = $derived(characters.hover);
	const name = $derived(
		hover ? (characters.index?.entries[hover.entry]?.name ?? "") : "",
	);
	const note = $derived(name ? characters.note(name) : "");
</script>

{#if hover && note}
	<CharacterAnchor
		rect={hover.rect}
		sheet={false}
		onDismiss={() => (characters.hover = null)}
	>
		<div class="note" role="tooltip">
			<span class="who">{name}</span>
			<p>{note}</p>
		</div>
	</CharacterAnchor>
{/if}

<style>
	.note {
		width: max-content;
		max-width: min(20rem, calc(100vw - 2rem));
		padding: 0.5rem 0.7rem 0.6rem;
	}
	.who {
		display: block;
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--glow-text-muted);
	}
	p {
		margin: 0.2rem 0 0;
		font-size: 0.85rem;
		line-height: 1.45;
		white-space: pre-wrap;
	}
</style>
