<script lang="ts">
	import type { ReaderController } from "$lib/reader/reader.svelte";
	import type { ReaderSettings } from "$lib/reader/settings.svelte";
	import DogEar from "./DogEar.svelte";

	let {
		reader,
		settings,
		container = $bindable(),
	}: {
		reader: ReaderController;
		settings: ReaderSettings;
		container?: HTMLDivElement;
	} = $props();
</script>

<div class="stage" class:shaded={reader.showStacks}>
	{#if settings.flow === "paginated"}
		<button class="nav left" onclick={reader.prev} aria-label="Previous page"
			>‹</button
		>
	{/if}
	<div class="book" style="width:{reader.bookWidthRem}rem">
		{#if reader.showStacks}
			<div
				class="stack left"
				style="width:{reader.leftStackPx}px"
				aria-hidden="true"
			></div>
		{/if}
		<div class="view" bind:this={container}>
			<DogEar folds={reader.folds} />
			{#if reader.showSpine}<div class="spine" aria-hidden="true"></div>{/if}
			{#if settings.shading}
				<svg
					class="grain"
					xmlns="http://www.w3.org/2000/svg"
					aria-hidden="true"
				>
					<filter id="paper-grain">
						<feTurbulence
							type="fractalNoise"
							baseFrequency="0.8"
							numOctaves="1"
							stitchTiles="stitch"
						/>
						<feColorMatrix type="saturate" values="0" />
					</filter>
					<rect width="100%" height="100%" filter="url(#paper-grain)" />
				</svg>
			{/if}
		</div>
		{#if reader.showStacks}
			<div
				class="stack right"
				style="width:{reader.rightStackPx}px"
				aria-hidden="true"
			></div>
		{/if}
	</div>
	{#if settings.flow === "paginated"}
		<button class="nav right" onclick={reader.next} aria-label="Next page"
			>›</button
		>
	{/if}
</div>

<style>
	.stage {
		flex: 1;
		min-height: 0;
		display: flex;
		justify-content: center;
		/* the "desk" the book rests on */
		background: var(--surface);
		padding: clamp(0.75rem, 2.5vh, 1.75rem) 0;
		transition: background 0.2s ease;
	}
	.book {
		/* width is set inline (reading width); the nav buttons take the rest */
		flex: 0 1 auto;
		max-width: 100%;
		min-width: 0;
		/* explicit height so foliate-view's height:100% resolves to a definite
		   value — otherwise foliate measures the page short and centers it */
		height: 100%;
		display: flex;
		align-items: stretch;
		background: var(--bg);
		border-radius: 12px;
		overflow: hidden;
		box-shadow:
			0 10px 30px rgba(0, 0, 0, 0.22),
			0 2px 8px rgba(0, 0, 0, 0.12);
	}
	.view {
		position: relative;
		flex: 1;
		min-width: 0;
		height: 100%;
		overflow: hidden;
	}

	/* paper grain overlaid on the page (over the iframe text, non-interactive) */
	.grain {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 4;
		pointer-events: none;
		opacity: 0.2;
	}

	/* center spine / gutter shadow of an open book */
	.spine {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 170px;
		transform: translateX(-50%);
		z-index: 5;
		pointer-events: none;
		background: linear-gradient(
			to right,
			rgba(0, 0, 0, 0) 0%,
			rgba(0, 0, 0, 0.05) 38%,
			rgba(0, 0, 0, 0.16) 48%,
			rgba(0, 0, 0, 0.22) 50%,
			rgba(0, 0, 0, 0.16) 52%,
			rgba(0, 0, 0, 0.05) 62%,
			rgba(0, 0, 0, 0) 100%
		);
	}

	/* physical-book page-edge stacks */
	.stack {
		flex: 0 0 auto;
		align-self: stretch;
		pointer-events: none;
		background-color: var(--bg);
		/* thin vertical lines = stacked page edges; count scales with width */
		background-image: repeating-linear-gradient(
			to right,
			color-mix(in srgb, var(--fg) 10%, transparent) 0 1px,
			transparent 1px 2.5px
		);
		transition: width 0.18s ease;
	}
	.stack.left {
		/* recess shadow toward the reading page (right edge) + outer-edge darkening */
		box-shadow:
			inset -7px 0 9px -7px rgba(0, 0, 0, 0.5),
			inset 3px 0 4px -3px rgba(0, 0, 0, 0.35);
		border-radius: 2px 0 0 2px;
	}
	.stack.right {
		box-shadow:
			inset 7px 0 9px -7px rgba(0, 0, 0, 0.5),
			inset -3px 0 4px -3px rgba(0, 0, 0, 0.35);
		border-radius: 0 2px 2px 0;
	}
	.nav {
		/* grow to fill the desk out to the screen edge — the whole side is a
		   click target for turning the page */
		flex: 1 1 0;
		min-width: 3rem;
		border: none;
		background: transparent;
		color: var(--dim);
		font-size: 2rem;
		opacity: 0.5;
		cursor: pointer;
		transition:
			opacity 0.15s ease,
			color 0.15s ease;
	}
	.nav:hover {
		opacity: 1;
		color: var(--fg);
	}
</style>
