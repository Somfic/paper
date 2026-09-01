<script lang="ts">
	// A name lives inside foliate's iframe, so there is nothing in this document
	// to hang a popover off. This is that anchor: a box laid over the name for
	// glow to measure and position against, which never takes a pointer event of
	// its own — the prose underneath has to stay clickable and selectable.
	//
	// It also settles the bug this component exists to fix. The reader's header
	// carries `z-index: 3`, which makes it a stacking context, so anything the
	// cast drew from inside it was trapped below the page and the book's own
	// text painted straight over the top. glow's popovers portal their content
	// to the body, which puts them where they belong.
	import type { Snippet } from "svelte";
	import { Popover } from "glow";
	import type { Rect } from "$lib/reader/characters";

	let {
		rect,
		onDismiss,
		sheet = true,
		children,
	}: {
		rect: Rect;
		onDismiss: () => void;
		sheet?: boolean;
		children: Snippet;
	} = $props();
</script>

<div
	class="anchor"
	style:left="{rect.left}px"
	style:top="{rect.top}px"
	style:width="{Math.max(1, rect.right - rect.left)}px"
	style:height="{Math.max(1, rect.bottom - rect.top)}px"
>
	<Popover
		manual
		align="left"
		offset={8}
		{sheet}
		bind:open={() => true, (open) => !open && onDismiss()}
	>
		{#snippet trigger()}
			<span class="over" aria-hidden="true"></span>
		{/snippet}
		{@render children()}
	</Popover>
</div>

<style>
	.anchor {
		position: fixed;
		pointer-events: none;
	}
	.anchor :global(.popover),
	.over {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
