<script lang="ts">
	import { goto } from "$app/navigation";
	import { Button } from "glow";
	import type { ReaderController } from "$lib/reader/reader.svelte";
	import type { ReaderSettings } from "$lib/reader/settings.svelte";
	import CastMenu from "./CastMenu.svelte";
	import ChapterMenu from "./ChapterMenu.svelte";
	import SettingsMenu from "./SettingsMenu.svelte";

	let {
		reader,
		settings,
	}: { reader: ReaderController; settings: ReaderSettings } = $props();
</script>

<header>
	<Button
		variant="ghost"
		icon="ArrowLeft"
		tooltip="Back to shelf"
		onclick={() => goto("/")}
	/>
	<div class="titles">
		<span class="title">{reader.displayTitle}</span>
		{#if reader.metaAuthor}<span class="author">{reader.metaAuthor}</span
			>{/if}
	</div>
	<Button
		variant="ghost"
		icon={reader.isFullscreen ? "Minimize" : "Maximize"}
		onclick={reader.toggleFullscreen}
	/>
	<CastMenu {reader} />
	{#if reader.toc.length > 0}
		<ChapterMenu items={reader.chapterItems} folds={reader.folds} />
	{/if}
	<SettingsMenu {settings} />
</header>

<style>
	header {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: var(--chrome);
		border-bottom: 1px solid var(--border);
		flex: 0 0 auto;
		z-index: 3;
	}
	.titles {
		flex: 1;
		min-width: 0;
		text-align: center;
		display: flex;
		flex-direction: column;
		line-height: 1.2;
	}
	.title {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.author {
		font-size: 0.78rem;
		color: var(--dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
