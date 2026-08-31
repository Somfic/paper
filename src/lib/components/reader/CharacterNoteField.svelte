<script lang="ts">
	// Its own component, and mounted under `{#key}`, so that the draft is seeded
	// once per character. Syncing it from storage instead would fight the
	// keyboard: the stored note is trimmed, so the space you just typed would be
	// taken back out from under the caret.
	import { untrack } from "svelte";
	import { TextareaInput } from "glow";
	import type { CharacterController } from "$lib/reader/characters.svelte";

	let {
		name,
		characters,
	}: { name: string; characters: CharacterController } = $props();

	// `untrack` says out loud what the `{#key}` above already arranges: this is
	// the note as it stands when the field appears, and from then on the field
	// is the one writing.
	const initial = untrack(() => characters.note(name));
	let draft = $state(initial);
	let writing = $state(!!initial);
</script>

<div class="note">
	{#if writing}
		<span class="label">Your note</span>
		<TextareaInput
			rows={3}
			bind:value={draft}
			placeholder="Anything you want to remember about {name}…"
			onChange={(value) => characters.setNote(name, value)}
		/>
	{:else}
		<button class="add" onclick={() => (writing = true)}>
			Add a note about {name}
		</button>
	{/if}
</div>

<style>
	.note {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding-top: 0.55rem;
		border-top: 1px solid var(--glow-border-color);
	}
	.label {
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--glow-text-muted);
	}
	.add {
		align-self: flex-start;
		padding: 0.25rem 0;
		border: none;
		background: transparent;
		color: var(--glow-text-secondary);
		font: inherit;
		font-size: 0.78rem;
		text-align: left;
		cursor: pointer;
	}
	.add:hover {
		color: var(--glow-primary);
	}
</style>
