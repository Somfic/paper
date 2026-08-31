<script lang="ts">
	import type { CharacterController } from "$lib/reader/characters.svelte";
	import CharacterAnchor from "./CharacterAnchor.svelte";
	import CharacterCard from "./CharacterCard.svelte";

	let { characters }: { characters: CharacterController } = $props();

	const open = $derived(characters.popover);
	const evidence = $derived(open ? characters.evidence(open.entry) : null);
</script>

{#if open && evidence}
	<CharacterAnchor rect={open.rect} onDismiss={characters.dismiss}>
		<div class="card" role="dialog" aria-label="About {evidence.name}">
			<div class="bar">
				<span class="name">{evidence.name}</span>
				<button onclick={characters.dismiss} aria-label="Close">✕</button>
			</div>
			<div class="body">
				<CharacterCard {evidence} {characters} />
			</div>
		</div>
	</CharacterAnchor>
{/if}

<style>
	.card {
		width: min(21rem, calc(100vw - 2rem));
		display: flex;
		flex-direction: column;
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.45rem 0.4rem 0.45rem 0.8rem;
		border-bottom: 1px solid var(--glow-border-color);
	}
	.name {
		font-weight: 600;
		font-size: 0.92rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bar button {
		border: none;
		background: transparent;
		color: var(--glow-text-muted);
		font-size: 0.8rem;
		line-height: 1;
		padding: 0.3rem 0.45rem;
		border-radius: 6px;
		cursor: pointer;
	}
	.bar button:hover {
		color: var(--glow-text-primary);
		background: var(--glow-fg-soft);
	}
	.body {
		padding: 0.65rem 0.8rem 0.8rem;
		max-height: 50vh;
		overflow-y: auto;
	}
</style>
