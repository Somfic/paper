<script lang="ts">
	import { page } from "$app/state";
	import { ReaderSettings } from "$lib/reader/settings.svelte";
	import { ReaderController } from "$lib/reader/reader.svelte";
	import ReaderHeader from "$lib/components/reader/ReaderHeader.svelte";
	import ReaderStage from "$lib/components/reader/ReaderStage.svelte";
	import ReaderStatusBar from "$lib/components/reader/ReaderStatusBar.svelte";
	import ReaderProgress from "$lib/components/reader/ReaderProgress.svelte";

	const id = $derived(Number(page.params.id));

	const settings = new ReaderSettings();
	const reader = new ReaderController(settings);

	let container = $state<HTMLDivElement>();

	// Persist settings + keep the renderer in sync for the component's lifetime.
	$effect(() => settings.connect());
	$effect(() => reader.connect());

	// (Re)open the book whenever the id changes or the view container appears.
	$effect(() => {
		if (container) return reader.load(id, container);
	});

	const theme = $derived(reader.theme);
</script>

<div
	class="reader"
	style="--bg:{theme.bg};--fg:{theme.fg};--dim:{theme.dim};--chrome:{theme.chrome};--border:{theme.border};--link:{theme.link};--surface:{theme.surface};"
>
	<ReaderHeader {reader} {settings} />

	{#if reader.error}
		<p class="error">{reader.error}</p>
	{/if}

	<ReaderStage {reader} {settings} bind:container />

	{#if reader.showPageInfo}
		<ReaderStatusBar {reader} />
	{/if}

	<ReaderProgress fraction={reader.fraction} />
</div>

<style>
	.reader {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: var(--bg);
		color: var(--fg);
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}
	.error {
		color: #cf222e;
		padding: 0.5rem 1rem;
	}
</style>
