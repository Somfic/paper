<script lang="ts">
	import { Button, Popover } from "glow";
	import { CharacterController } from "$lib/reader/characters.svelte";
	import type { ReaderController } from "$lib/reader/reader.svelte";
	import CharacterCard from "./CharacterCard.svelte";
	import CharacterNote from "./CharacterNote.svelte";
	import CharacterPopover from "./CharacterPopover.svelte";

	let { reader }: { reader: ReaderController } = $props();

	const characters = new CharacterController();

	// Watch the book that is actually open; re-attaches if the route changes id.
	$effect(() => {
		const id = reader.book?.id;
		if (!reader.ready || id === undefined) return;
		return characters.attach(reader, id);
	});

	let expanded = $state<number | null>(null);
	const cast = $derived(characters.cast);
</script>

<!-- Hidden entirely until the scan finds a cast worth browsing: a non-fiction
     book has no characters, and an empty panel is worse than no button. -->
{#if characters.usable}
	<Popover bind:open={characters.panelOpen} align="right" offset={8}>
		{#snippet trigger()}
			<!-- the label would otherwise sit on top of the panel it opened -->
			<Button
				variant="ghost"
				icon="Users"
				tooltip={characters.panelOpen ? "" : "Cast so far"}
			/>
		{/snippet}
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
								{#if characters.note(member.name)}
									<!-- you have written about them; the panel is where
									     you would come looking for that -->
									<span class="noted" title="You wrote a note">●</span>
								{/if}
								<span class="count">{member.count}</span>
							</button>
							{#if evidence}
								<div class="detail">
									<CharacterCard {evidence} {characters} />
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty">Nobody yet. The list fills in as you read.</p>
			{/if}
		</div>
	</Popover>
{/if}

<CharacterPopover {characters} />
<CharacterNote {characters} />

<style>
	.panel {
		width: min(21rem, calc(100vw - 1.5rem));
		max-height: min(28rem, 70vh);
		overflow-y: auto;
		padding: 0.55rem;
	}
	.lede,
	.empty {
		margin: 0 0.25rem 0.5rem;
		font-size: 0.7rem;
		line-height: 1.4;
		color: var(--glow-text-muted);
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
		gap: 0.5rem;
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
		background: var(--glow-fg-soft);
	}
	.name {
		font-size: 0.86rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.noted {
		flex: 0 0 auto;
		font-size: 0.5rem;
		line-height: 1;
		color: var(--glow-primary);
	}
	.count {
		flex: 1 0 auto;
		text-align: right;
		font-size: 0.68rem;
		font-variant-numeric: tabular-nums;
		color: var(--glow-text-muted);
	}
	.detail {
		padding: 0.2rem 0.45rem 0.6rem;
	}
</style>
