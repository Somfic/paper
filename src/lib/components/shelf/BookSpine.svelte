<script lang="ts">
	// One book, standing up. The spine is the only face you normally see; the
	// front cover is a second face hinged behind it, so tilting the book out of
	// the shelf swings the real jacket into view.
	import * as library from "$lib/library";
	import type { Book } from "$lib/library";
	import {
		bandGradient,
		inkFor,
		spineHeight,
		spineType,
		spineWidth,
		type SpineArt,
	} from "$lib/shelf/spine";
	import GeneratedCover from "./GeneratedCover.svelte";

	let {
		book,
		art,
		onDelete,
	}: { book: Book; art: SpineArt; onDelete: (id: number) => void } = $props();

	let width = $derived(spineWidth(book));
	let height = $derived(spineHeight(book));
	let type = $derived(spineType(book, width, height));
	let ink = $derived(inkFor(art));
	let faceWidth = $derived(Math.round(height * 0.66)); // the usual 2:3 trim

	// The jacket is edge-on until someone tilts the book out, so its blob is
	// fetched on that first hover rather than for forty books at shelf load.
	let wanted = $state(false);
	let coverUrl = $state<string | null>(null);

	// Read through primitives rather than off the prop: ingest rewrites the whole
	// record, and re-running for a new word count would revoke an object URL the
	// <img> is still loading.
	let coverId = $derived(book.id);
	let hasCover = $derived(!!book.has_cover);

	$effect(() => {
		const [id, stored, show] = [coverId, hasCover, wanted];
		if (!show || !stored) return;
		let url: string | null = null;
		let cancelled = false;

		(async () => {
			try {
				const blob = await library.cover(id);
				if (cancelled || !blob) return;
				url = URL.createObjectURL(blob);
				coverUrl = url;
			} catch {
				// No jacket to show is the generated cover's cue, not an error.
			}
		})();

		return () => {
			cancelled = true;
			coverUrl = null;
			if (url) URL.revokeObjectURL(url);
		};
	});

	function remove() {
		onDelete(book.id);
	}

	let label = $derived(book.author ? `${book.title} — ${book.author}` : book.title);
</script>

<div
	class="book"
	style:--w="{width}px"
	style:--h="{height}px"
	style:--face="{faceWidth}px"
	style:--spine={bandGradient(art.bands)}
	style:--accent={art.accent}
	style:--ink={ink.fg}
	style:--ink-shade={ink.shade}
>
	<a
		class="volume"
		href={`/book/${book.id}`}
		title={label}
		aria-label={label}
		onpointerenter={() => (wanted = true)}
		onfocus={() => (wanted = true)}
	>
		<div class="spine">
			<div class="type" style:font-size="{type.size}px">
				<span class="title">{type.title}</span>
				{#if type.author}
					<span class="author">{type.author}</span>
				{/if}
			</div>
			{#if type.mark}
				<div class="foot"><span class="mark">{type.mark}</span></div>
			{/if}
		</div>
		<div class="face">
			{#if coverUrl}
				<img src={coverUrl} alt="" />
			{:else}
				<GeneratedCover title={book.title} author={book.author ?? ""} format={book.format} />
			{/if}
		</div>
	</a>
	<button class="delete" title={`Remove ${book.title}`} onclick={remove}>✕</button>
</div>

<style>
	.book {
		position: relative;
		flex: 0 0 auto;
		width: var(--w);
		/* One shelf row, with the board's thickness left free at the bottom. */
		height: var(--row);
		padding-bottom: var(--plank);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		/* Per-book perspective, so a book tilts the same way wherever it stands. */
		perspective: 1200px;
		perspective-origin: 50% 70%;
	}
	.book:hover,
	.book:focus-within {
		/* The tilted book sweeps over its right-hand neighbour. */
		z-index: 2;
	}

	.volume {
		position: relative;
		display: block;
		width: var(--w);
		height: var(--h);
		transform-style: preserve-3d;
		transform-origin: left bottom;
		transition: transform 260ms cubic-bezier(0.34, 1.3, 0.64, 1);
		text-decoration: none;
		color: inherit;
	}
	.book:hover .volume,
	.volume:focus-visible {
		/* Pulled up an inch and hinged open on the spine, the way you'd tip a
		   book out with a finger on its headband. */
		transform: translateY(-10px) rotateY(-36deg) rotateX(2deg);
	}
	.volume:focus-visible {
		outline: none;
	}

	.spine {
		position: absolute;
		inset: 0;
		background: var(--spine);
		border-radius: 2px 2px 1px 1px;
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.06) inset,
			0 12px 20px -10px rgba(0, 0, 0, 0.9);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		align-items: center;
		/* Matches PAD in shelf/spine.ts, which measures the type against it. */
		padding: 13px 0;
		backface-visibility: hidden;
		font-family: Georgia, "Iowan Old Style", "Times New Roman", serif;
		/* Explicit, because the app's body weight is 600 and a serif with no 600
		   face gets synthetically emboldened — 15% wider than the run that was
		   measured for it in shelf/spine.ts, which is a collision. */
		font-weight: 400;
		color: var(--ink);
	}
	/* A printed rule at the head, and the shading that makes a flat rectangle
	   read as the rounded back of a bound book. */
	.spine::before {
		content: "";
		position: absolute;
		left: 0;
		right: 0;
		top: 6px;
		height: 1px;
		background: var(--ink);
		opacity: 0.28;
	}
	.spine::after {
		content: "";
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(
			to right,
			rgba(0, 0, 0, 0.45) 0%,
			rgba(0, 0, 0, 0.08) 9%,
			rgba(255, 255, 255, 0.14) 26%,
			rgba(255, 255, 255, 0.02) 55%,
			rgba(0, 0, 0, 0.18) 86%,
			rgba(0, 0, 0, 0.42) 100%
		);
	}

	/* Vertical type: in vertical-rl a flex row runs top to bottom, so the title
	   and author stack down the spine and `justify-content` centres the pair. */
	.type {
		position: relative;
		z-index: 1;
		flex: 1;
		min-height: 0;
		writing-mode: vertical-rl;
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		gap: 12px;
		overflow: hidden;
		/* A halo, not a drop shadow: the type crosses whatever the jacket's edge
		   was doing at that point, and has to stay legible over all of it. */
		text-shadow:
			0 0 3px var(--ink-shade),
			0 1px 1px var(--ink-shade);
	}
	.type > span {
		/* The last defence if the measured fit was optimistic. */
		min-width: 0;
		min-height: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.title {
		font-weight: 700;
		letter-spacing: 0.09em;
	}
	.author {
		font-size: 0.86em;
		font-style: italic;
		letter-spacing: 0.03em;
		opacity: 0.86;
	}

	.foot {
		position: relative;
		z-index: 1;
		align-self: stretch;
		display: flex;
		justify-content: center;
		/* Together with the rule above it, MARK's px budget in shelf/spine.ts. */
		max-height: 12px;
		overflow: hidden;
		margin-top: 4px;
		padding-top: 3px;
		border-top: 1px solid currentcolor;
	}
	.mark {
		/* Across the foot rather than along the spine, as a publisher sets it. */
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 6px;
		font-weight: 700;
		line-height: 1;
		letter-spacing: 0.03em;
		opacity: 0.78;
		white-space: nowrap;
	}

	.face {
		position: absolute;
		top: 0;
		left: 100%;
		width: var(--face);
		height: 100%;
		/* Hinged at the spine's edge and folded back into the shelf, so it is
		   invisibly edge-on until the book turns. */
		transform-origin: left center;
		transform: rotateY(90deg);
		background: var(--accent);
		border-radius: 0 3px 3px 0;
		overflow: hidden;
		box-shadow: -1px 0 0 rgba(0, 0, 0, 0.35) inset;
	}
	/* The jacket is lit from the front of the shelf, so it falls away into shadow
	   towards the hinge — without this it reads as a sticker, not a board. */
	.face::after {
		content: "";
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to right,
			rgba(0, 0, 0, 0.5) 0%,
			rgba(0, 0, 0, 0.16) 22%,
			rgba(0, 0, 0, 0) 60%,
			rgba(255, 255, 255, 0.06) 100%
		);
	}
	.face img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.delete {
		position: absolute;
		left: 50%;
		bottom: calc(var(--h) + var(--plank) + 5px);
		transform: translateX(-50%);
		width: 20px;
		height: 20px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.55);
		color: white;
		font-size: 0.7rem;
		line-height: 1;
		cursor: pointer;
		opacity: 0;
		pointer-events: none;
		transition: opacity 150ms ease;
	}
	.book:hover .delete,
	.delete:focus-visible {
		opacity: 1;
		pointer-events: auto;
	}

	@media (prefers-reduced-motion: reduce) {
		.volume {
			transition: none;
		}
	}
</style>
