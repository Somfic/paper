<script lang="ts">
	// One book, standing up. The spine is the only face you normally see; the
	// front cover is a second face hinged behind it, so tilting the book out of
	// the shelf swings the real jacket into view.
	//
	// The two other faces of the box are deliberately not built. At this camera
	// the left cover and the fore-edge point into the shelf, and the head sits
	// 200-odd px above the eye — it would take a 7deg backward lean just to draw
	// level with it, which reads as a book falling over rather than one being
	// looked at. They would be geometry nobody ever sees.
	import * as library from "$lib/library";
	import type { Book } from "$lib/library";
	import {
		bandGradient,
		FACE_RATIO,
		GAP,
		inkFor,
		MARK_SIZE,
		PAD,
		PERSPECTIVE,
		SCALE,
		spineHeight,
		spineType,
		spineWidth,
		TILT_Z,
		type SpineArt,
	} from "$lib/shelf/spine";
	import GeneratedCover from "./GeneratedCover.svelte";

	let {
		book,
		art,
		stack,
		onDelete,
	}: {
		book: Book;
		art: SpineArt;
		/** Where this book sits in the row's paint order; see .book in the styles. */
		stack: number;
		onDelete: (id: number) => void;
	} = $props();

	let width = $derived(spineWidth(book));
	let height = $derived(spineHeight(book));
	let type = $derived(spineType(book, width, height));
	let ink = $derived(inkFor(art));
	let faceWidth = $derived(Math.round(height * FACE_RATIO));

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
	style:--stack={stack}
	style:--scale={SCALE}
	style:--tilt-z="{TILT_Z}px"
	style:--perspective="{PERSPECTIVE}px"
	style:--pad="{PAD}px"
	style:--gap="{GAP}px"
	style:--mark-size="{MARK_SIZE}px"
>
	<span class="cast" aria-hidden="true"></span>
	<a
		class="volume"
		href={`/book/${book.id}`}
		title={label}
		aria-label={label}
		onpointerenter={() => (wanted = true)}
		onfocus={() => (wanted = true)}
	>
		<!-- Drawn out by .volume, turned by .turn. Two elements because the two
		     movements are a hand's two movements, and CSS times a transform whole. -->
		<div class="turn">
			<div class="spine">
				<div class="type" style:font-size="{type.size}px">
					<div class="lines">
						{#each type.lines as line}
							<span class="title">{line}</span>
						{/each}
					</div>
					{#if type.author}
						<span class="author">{type.author}</span>
					{/if}
				</div>
				{#if type.mark}
					<div class="foot"><span class="mark">{type.mark}</span></div>
				{/if}
				<span class="shade" aria-hidden="true"></span>
			</div>
			<div class="face">
				{#if coverUrl}
					<img src={coverUrl} alt="" />
				{:else}
					<GeneratedCover
						title={book.title}
						author={book.author ?? ""}
						format={book.format}
					/>
				{/if}
			</div>
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
		/* Per-book perspective, so a book tilts the same way wherever it stands —
		   and so shelf/spine.ts can work out how far the swing reaches. */
		perspective: var(--perspective);
		perspective-origin: 50% 70%;
		/* The row paints right to left, so every book already stands above the
		   ones its jacket can sweep over. Raising this on :hover instead looks
		   identical on the way out and breaks on the way back: z-index cannot be
		   transitioned, so it drops the moment the pointer leaves and the book
		   spends the whole of its return being clipped by the neighbour it is
		   still swung over. Bookshelf numbers them. */
		z-index: var(--stack);
	}

	/* Taking a book off a shelf is two movements, not one: it is drawn clear of
	   its neighbours, and then it is turned to be read. Doing both on one
	   transform — which is all a single element can do, since CSS times a
	   transform as a whole — is what made the old tilt read as a card flipping.
	   So the pull lives on .volume and the turn on .turn, each with its own
	   duration, easing and delay, and the composite is unchanged: the clearance
	   shelf/spine.ts reserves at the end of a row still describes this exactly.

	   Going out, the pull leads and the turn follows and overshoots a little.
	   Coming back the order reverses — it squares up first, then slides home —
	   which is the asymmetry that stops the return reading as a rewind. Each
	   direction's timing lives on the rule that direction settles into. */
	.volume {
		position: relative;
		display: block;
		width: var(--w);
		height: var(--h);
		transform-style: preserve-3d;
		transform-origin: left bottom;
		/* Back into the row, once the turn has had time to square up. */
		transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1) 150ms;
		text-decoration: none;
		color: inherit;
	}
	.turn {
		position: absolute;
		inset: 0;
		transform-style: preserve-3d;
		transform-origin: left bottom;
		/* Square again, immediately — this is what the pull is waiting on. */
		transition: transform 280ms cubic-bezier(0.4, 0, 0.3, 1);
	}
	.book:hover .volume,
	.book:has(.volume:focus-visible) .volume {
		/* Clear of the row first: turning it in place would swing the jacket
		   across its neighbours, and the perspective on a face TILT_Z nearer is
		   what makes the cover big enough to actually read. */
		transform: translateZ(var(--tilt-z)) translateY(calc(-16px * var(--scale)));
		transition: transform 230ms cubic-bezier(0.16, 0.84, 0.44, 1);
	}
	.book:hover .turn,
	.book:has(.volume:focus-visible) .turn {
		/* Then turned, starting while the pull is still running so the two read as
		   one gesture, and easing past the angle before settling on it — at the
		   -36deg it opened to before, the jacket sat 54deg off square and its own
		   title was unreadable. */
		transform: rotateY(-54deg) rotateX(2deg);
		transition: transform 420ms cubic-bezier(0.22, 1.05, 0.36, 1) 90ms;
	}
	.volume:focus-visible {
		outline: none;
	}

	/* The shadow this throws across the books to its right is Bookshelf's: it is
	   a fact about a row, and Svelte only scopes a selector within one component. */

	/* The shelf is lit from the front, so the spine loses the light as it turns
	   away from it and the jacket comes into it. Two opacities on gradients that
	   were already there, timed with the turn: without this the faces keep their
	   resting shading all the way round and the book reads as painted, not lit.
	   Bookshelf reaches for .shade too, to put this book's right-hand neighbours
	   into the shadow of its jacket. */
	.shade {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
		background: linear-gradient(to right, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.16));
		opacity: 0;
		transition: opacity 280ms ease;
	}
	.book:hover .shade,
	.book:has(.volume:focus-visible) .shade {
		opacity: 1;
		transition: opacity 420ms ease 90ms;
	}
	.book:hover .face::after,
	.book:has(.volume:focus-visible) .face::after {
		opacity: 0.4;
	}

	/* What the book throws on the board as it lifts and swings: absent while it
	   stands square (the boards already draw the row's contact shadow), then
	   stretching out from the spine's foot along the turn. Outside .volume, so
	   it stays flat on the board instead of travelling with the book. */
	.cast {
		position: absolute;
		left: 0;
		bottom: var(--plank);
		width: var(--w);
		height: calc(15px * var(--scale));
		pointer-events: none;
		transform-origin: left bottom;
		background: radial-gradient(
			ellipse at 30% 100%,
			rgba(0, 0, 0, 0.5),
			rgba(0, 0, 0, 0) 70%
		);
		opacity: 0;
		transition:
			opacity 260ms ease,
			transform 280ms cubic-bezier(0.4, 0, 0.2, 1);
	}
	.book:hover .cast,
	.book:has(.volume:focus-visible) .cast {
		opacity: 1;
		transform: scale(3.1, 1.15);
		transition:
			opacity 300ms ease 60ms,
			transform 460ms cubic-bezier(0.22, 1.05, 0.36, 1) 90ms;
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
		/* PAD itself, since shelf/spine.ts measures the type against it. */
		padding: var(--pad) 0;
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
		top: calc(6px * var(--scale));
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
		gap: var(--gap);
		overflow: hidden;
		/* A halo, not a drop shadow: the type crosses whatever the jacket's edge
		   was doing at that point, and has to stay legible over all of it. */
		text-shadow:
			0 0 calc(3px * var(--scale)) var(--ink-shade),
			0 1px calc(1px * var(--scale)) var(--ink-shade);
	}
	.type span {
		/* The last defence if the measured fit was optimistic. */
		min-width: 0;
		min-height: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* A two-line title stacks across the spine rather than down it. A spine is
	   read by turning it upright anticlockwise, which brings its left edge to the
	   top — so the first line has to sit on the left, which is what the block
	   axis of vertical-rl gives a plain `column`. */
	.lines {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 0;
		min-height: 0;
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
		max-height: calc(12px * var(--scale));
		overflow: hidden;
		margin-top: calc(4px * var(--scale));
		padding-top: calc(3px * var(--scale));
		border-top: 1px solid currentcolor;
	}
	.mark {
		/* Across the foot rather than along the spine, as a publisher sets it. */
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: var(--mark-size);
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
		transition: opacity 420ms ease 90ms;
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
		bottom: calc(var(--h) + var(--plank) + 5px * var(--scale));
		transform: translateX(-50%);
		width: calc(20px * var(--scale));
		height: calc(20px * var(--scale));
		padding: 0;
		border: none;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.55);
		color: white;
		font-size: calc(0.7rem * var(--scale));
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
		.volume,
		.turn,
		.cast,
		.shade,
		.face::after {
			transition: none;
		}
	}
</style>
