<script lang="ts">
	import { untrack } from "svelte";
	import type { ReaderController } from "$lib/reader/reader.svelte";
	import { PagePacer } from "$lib/reader/pacer.svelte";

	let { reader }: { reader: ReaderController } = $props();

	// One pacer for the component's life: the route hands us the same controller
	// for as long as the book is open.
	const pacer = untrack(() => new PagePacer(reader, reader.settings));
	$effect(() => pacer.connect());
</script>

{#if pacer.active}
	<!-- Ambient only: no colour shift, no pulse, and empty is not an alarm. -->
	<div
		class="pacer"
		aria-hidden="true"
		title={pacer.pageWords > 0
			? `${pacer.pageWords} words at ${pacer.wpm} wpm`
			: "no words to pace on this page"}
	>
		<!--
			The drain is one CSS animation, restarted by re-creating the wick on each
			page (`run`). Restarting it from script instead — a transition plus a
			forced reflow, or Element.animate() — flushes style mid-boot, which hands
			foliate its pending resize notification while a section iframe is still
			swapping and trips an unguarded render inside it. A page with nothing to
			count keeps the wick's resting full width instead of an empty track.
		-->
		{#key pacer.run}
			<div
				class="wick"
				class:draining={pacer.durationMs > 0}
				style="animation-duration:{pacer.durationMs}ms"
			></div>
		{/key}
	</div>
{/if}

<style>
	.pacer {
		flex: 0 0 auto;
		align-self: center;
		margin-left: auto; /* keep it beside the page count, not mid-bar */
		width: 4.5rem;
		height: 2px;
		border-radius: 1px;
		background: var(--border);
		overflow: hidden;
	}
	.wick {
		height: 100%;
		background: var(--dim);
		opacity: 0.5;
		transform-origin: left center;
	}
	.wick.draining {
		animation-name: drain;
		animation-timing-function: linear;
		animation-fill-mode: forwards;
	}
	@keyframes drain {
		from {
			transform: scaleX(1);
		}
		to {
			transform: scaleX(0);
		}
	}
</style>
