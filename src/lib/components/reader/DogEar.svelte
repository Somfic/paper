<script lang="ts">
	import { tooltip } from "glow";
	import type { FoldController } from "$lib/reader/folds.svelte";

	let { folds }: { folds: FoldController } = $props();
</script>

<!-- The page's top corner. Two triangles either side of the crease: the gap the
     turned-back corner leaves (the desk showing through) and the flap itself,
     which is the back of the page — so it takes the page's own colour. -->
{#if folds.available}
	<button
		type="button"
		class="dogear"
		class:folded={folds.folded}
		aria-pressed={folds.folded}
		aria-label={folds.folded ? "Unfold this page" : "Fold this page's corner"}
		onclick={folds.toggle}
		use:tooltip={{
			content: folds.folded ? "Unfold this page" : "Fold this corner",
			position: "left",
		}}
	>
		<span class="gap" aria-hidden="true"></span>
		<span class="flap" aria-hidden="true"></span>
	</button>
{/if}

<style>
	.dogear {
		--size: 2.6rem;
		position: absolute;
		top: 0;
		right: 0;
		width: var(--size);
		height: var(--size);
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
		/* above the grain (4) and the spine (5) so the corner is always clickable */
		z-index: 6;
	}

	/* Both halves are clipped to the crease, which runs from the box's top-left
	   to its bottom-right. Their gradients share one axis — 45°, the crease's
	   normal — along which the crease itself sits at exactly 50%. */
	.gap,
	.flap {
		position: absolute;
		inset: 0;
		transition:
			opacity 0.18s ease,
			transform 0.18s ease;
	}

	/* what the missing corner reveals: the desk, in the flap's shadow. Shading is
	   black rather than a `--fg` mix so it darkens in the dark theme too. */
	.gap {
		clip-path: polygon(0 0, 100% 0, 100% 100%);
		background-color: var(--surface);
		background-image: linear-gradient(
			45deg,
			rgba(0, 0, 0, 0.4) 50%,
			rgba(0, 0, 0, 0.04) 90%
		);
		opacity: 0;
	}

	/* the flap: the back of the page, so the page's own colour — the crease's
	   ridge catching the light, shade behind it, and a shadow cast on the page */
	.flap {
		clip-path: polygon(0 0, 100% 100%, 0 100%);
		background-color: var(--bg);
		background-image: linear-gradient(
			45deg,
			rgba(0, 0, 0, 0.01) 12%,
			rgba(0, 0, 0, 0.11) calc(50% - 4px),
			rgba(0, 0, 0, 0.2) calc(50% - 1.5px),
			rgba(255, 255, 255, 0.22) calc(50% - 1.5px)
		);
		filter: drop-shadow(-1.5px 2px 2.5px rgba(0, 0, 0, 0.3));
		/* at rest the corner is only just turned: a hint you can fold it */
		opacity: 0.2;
		transform: translate(25%, -25%);
	}

	.dogear:hover .flap,
	.dogear:focus-visible .flap {
		opacity: 0.6;
		transform: translate(12%, -12%);
	}

	.dogear.folded .gap {
		opacity: 1;
	}
	.dogear.folded .flap,
	.dogear.folded:hover .flap {
		opacity: 1;
		transform: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.gap,
		.flap {
			transition: none;
		}
	}
</style>
