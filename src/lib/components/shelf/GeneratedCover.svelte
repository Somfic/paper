<script lang="ts">
	// The fallback cover: two colour bands with a cream field between them, in
	// the Penguin tri-band arrangement. Drawn as SVG rather than rasterised so
	// the type stays sharp at any card size and nothing has to be cached.
	import { bandColour, titleLayout } from "$lib/library/covers";

	let {
		title,
		author = "",
		format = "",
	}: { title: string; author?: string; format?: string } = $props();

	const BAND = 76; // band height; the field is what's left between them
	const FIELD_MID = 150;
	const CREAM = "#f2ece0";

	let band = $derived(bandColour(title));
	let layout = $derived(titleLayout(title));

	// Stack the title lines and the author as one block and centre it in the
	// field, so a one-line title sits where a four-line one's middle would.
	let lineHeight = $derived(layout.size * 1.2);
	let titleHeight = $derived(layout.lines.length * lineHeight);
	let blockTop = $derived(FIELD_MID - (titleHeight + (author ? 21 : 0)) / 2);
	let authorY = $derived(blockTop + titleHeight + 19);

	let label = $derived(format.toUpperCase());
	let labelWidth = $derived(Math.max(34, label.length * 6.5 + 14));
</script>

<svg class="generated" viewBox="0 0 200 300" preserveAspectRatio="none" aria-hidden="true">
	<rect x="0" y="0" width="200" height="300" fill={CREAM} />
	<rect x="0" y="0" width="200" height={BAND} fill={band} />
	<rect x="0" y={300 - BAND} width="200" height={BAND} fill={band} />

	<!-- Hairlines just inside the field, the way a printed keyline reads. -->
	<rect x="0" y={BAND} width="200" height="1.2" fill="rgba(0, 0, 0, 0.16)" />
	<rect x="0" y={300 - BAND - 1.2} width="200" height="1.2" fill="rgba(0, 0, 0, 0.16)" />

	{#each layout.lines as line, i}
		<text
			class="headline"
			x="100"
			y={blockTop + layout.size + i * lineHeight}
			font-size={layout.size}
			fill="#2a2420">{line}</text
		>
	{/each}

	{#if author}
		<text class="byline" x="100" y={authorY} font-size="9" fill="#5c5248">{author}</text>
	{/if}

	{#if label}
		<rect
			x={100 - labelWidth / 2}
			y="248"
			width={labelWidth}
			height="17"
			rx="2.5"
			fill={CREAM}
			opacity="0.92"
		/>
		<text class="tag" x="100" y="260" font-size="7.5" fill={band}>{label}</text>
	{/if}
</svg>

<style>
	.generated {
		display: block;
		width: 100%;
		height: 100%;
	}
	text {
		text-anchor: middle;
		font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
	}
	.headline {
		font-weight: 700;
		letter-spacing: 0.055em;
	}
	.byline {
		font-style: italic;
	}
	.tag {
		font-weight: 700;
		letter-spacing: 0.2em;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
</style>
