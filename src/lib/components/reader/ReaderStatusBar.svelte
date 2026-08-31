<script lang="ts">
	import type { ReaderController } from "$lib/reader/reader.svelte";
	import PagePacer from "./PagePacer.svelte";

	let { reader }: { reader: ReaderController } = $props();
</script>

<div class="statusbar">
	<span class="chap" title={reader.chapterLabel}>{reader.chapterLabel}</span>
	<!-- Page-scoped furniture lives here; the whole-book bar is below us. -->
	<PagePacer {reader} />
	<span class="pages">
		{reader.chapterPage} / {reader.chapterPages}
		{#if reader.chapterLeft > 0}
			· {reader.chapterLeft} left in chapter
		{/if}
	</span>
</div>

<style>
	.statusbar {
		flex: 0 0 auto;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.4rem 1rem;
		font-size: 0.78rem;
		color: var(--dim);
		background: var(--chrome);
		border-top: 1px solid var(--border);
	}
	.statusbar .chap {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.statusbar .pages {
		flex: 0 0 auto;
		font-variant-numeric: tabular-nums;
	}
</style>
