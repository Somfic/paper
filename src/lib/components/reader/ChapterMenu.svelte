<script lang="ts">
	import { Button, PopoverMenu, type PopoverMenuEntry } from "glow";
	import type { FoldController } from "$lib/reader/folds.svelte";

	let { items, folds }: { items: PopoverMenuEntry[]; folds: FoldController } =
		$props();

	let open = $state(false);

	// Folds render as one custom entry rather than menu items: each row carries a
	// snippet *and* its own remove button, which a PopoverMenuItem has no room for.
	// They go above the chapters — a long table of contents would otherwise push
	// them off the end of a scrolling menu.
	const entries = $derived<PopoverMenuEntry[]>(
		folds.list.length === 0
			? items
			: [
					{ kind: "header", label: "Folded pages" },
					{ kind: "custom", render: foldRows },
					"divider",
					...items,
				],
	);

	function jump(fold: (typeof folds.list)[number]) {
		open = false;
		folds.goTo(fold);
	}
</script>

{#snippet foldRows()}
	{#each folds.list as fold (fold.cfi)}
		{@const lost = folds.isBroken(fold)}
		<div class="fold">
			<button type="button" class="place" onclick={() => jump(fold)}>
				<span class="where">{fold.label || "Unlabelled chapter"}</span>
				<span class="what" class:lost>
					{lost ? "no longer in this file" : fold.snippet || "no text here"}
				</span>
			</button>
			<Button
				variant="ghost"
				icon="X"
				tooltip="Remove fold"
				onclick={() => folds.remove(fold)}
			/>
		</div>
	{/each}
{/snippet}

<PopoverMenu items={entries} align="right" bind:open>
	{#snippet trigger()}
		<Button variant="ghost" icon="List" />
	{/snippet}
</PopoverMenu>

<style>
	.fold {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding-right: 0.25rem;
		border-radius: 6px;
	}
	.fold:hover {
		background: color-mix(in srgb, currentColor 7%, transparent);
	}
	.place {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.4rem 0.5rem;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.where {
		font-size: 0.82rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.what {
		font-size: 0.72rem;
		opacity: 0.6;
		/* two lines of the passage, then ellipsis */
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}
	.what.lost {
		font-style: italic;
	}
</style>
