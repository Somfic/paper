<script lang="ts">
	import { Button } from "glow";
	import { CharacterController } from "$lib/reader/characters.svelte";
	import type { ReaderController } from "$lib/reader/reader.svelte";
	import CharacterCard from "./CharacterCard.svelte";
	import CharacterPopover from "./CharacterPopover.svelte";

	let { reader }: { reader: ReaderController } = $props();

	const characters = new CharacterController();

	// Watch the book that is actually open; re-attaches if the route changes id.
	$effect(() => {
		const id = reader.book?.id;
		if (!reader.ready || id === undefined) return;
		return characters.attach(reader, id);
	});

	let root = $state<HTMLDivElement>();
	$effect(() => characters.registerPanel(root ?? null));

	let expanded = $state<number | null>(null);
	const cast = $derived(characters.cast);
</script>

<!-- Hidden entirely until the scan finds a cast worth browsing: a non-fiction
     book has no characters, and an empty panel is worse than no button. -->
{#if characters.usable}
	<div class="cast" bind:this={root}>
		<Button
			variant="ghost"
			icon="Users"
			tooltip="Cast so far"
			onclick={() => {
				characters.panelOpen = !characters.panelOpen;
			}}
		/>
		{#if characters.panelOpen}
			<div class="panel" role="dialog" aria-label="Cast so far">
				<p class="lede">
					Everyone you have met so far — nothing from further on than you
					have read.
				</p>
				{#if cast.length}
					<ul>
						{#each cast as member (member.entry)}
							{@const evidence =
								expanded === member.entry
									? characters.evidence(member.entry)
									: null}
							<li>
								<button
									class="row"
									aria-expanded={expanded === member.entry}
									onclick={() =>
										(expanded =
											expanded === member.entry ? null : member.entry)}
								>
									<span class="name">{member.name}</span>
									<span class="count">{member.count}</span>
								</button>
								{#if evidence}
									<div class="detail"><CharacterCard {evidence} /></div>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="empty">
						Nobody yet. The list fills in as you read.
					</p>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<CharacterPopover {characters} />

<style>
	.cast {
		position: relative;
		display: flex;
	}
	.panel {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		z-index: 22;
		width: min(21rem, calc(100vw - 1.5rem));
		max-height: min(28rem, 70vh);
		overflow-y: auto;
		padding: 0.55rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--chrome);
		color: var(--fg);
		box-shadow:
			0 12px 32px rgba(0, 0, 0, 0.26),
			0 2px 6px rgba(0, 0, 0, 0.14);
	}
	.lede,
	.empty {
		margin: 0 0.25rem 0.5rem;
		font-size: 0.7rem;
		line-height: 1.4;
		color: var(--dim);
	}
	.empty {
		margin-bottom: 0.25rem;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		width: 100%;
		padding: 0.35rem 0.45rem;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.row:hover {
		background: var(--surface);
	}
	.name {
		font-size: 0.86rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count {
		flex: 0 0 auto;
		font-size: 0.68rem;
		font-variant-numeric: tabular-nums;
		color: var(--dim);
	}
	.detail {
		padding: 0.2rem 0.45rem 0.6rem;
	}
</style>
