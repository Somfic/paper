<script lang="ts">
	// The shelf itself: books standing shoulder to shoulder on a board, wrapping
	// onto another board when they run out of room. Every row is exactly `ROW`
	// tall, which is what lets the boards be one repeating background rather than
	// a measured list of rows.
	import type { Book } from "$lib/library";
	import BookSpine from "./BookSpine.svelte";
	import {
		BOOK_HEIGHT,
		cachedArt,
		resolveArt,
		SCALE,
		SWING,
		shelfOrder,
		titleArt,
		type SpineArt,
	} from "$lib/shelf/spine";

	let { books, onDelete }: { books: Book[]; onDelete: (id: number) => void } = $props();

	// Of a piece with the books: the joinery is scaled by the same number their
	// height is, so a bigger shelf is a bigger shelf and not big books on thin
	// boards. `--scale` carries it into the rules that stay in px.
	const HEAD = Math.round(28 * SCALE); // clearance above the tallest book for the tilt and the ✕
	const PLANK = Math.round(11 * SCALE); // board thickness
	const ROW = BOOK_HEIGHT + HEAD + PLANK;

	let art = $state(new Map<number, SpineArt>());

	/**
	 * Art for a book, in descending order of certainty: sampled this session,
	 * cached from a previous one, or the title colour while we wait. The cached
	 * branch is why the hue order is settled at first paint instead of visibly
	 * rearranging itself once the jackets have been decoded.
	 */
	function artOf(book: Book): SpineArt {
		return art.get(book.id) ?? cachedArt(book) ?? titleArt(book);
	}

	// Ids already sampled, tagged with whether they had a cover at the time — a
	// book whose jacket arrives later (ingest, or an Open Library hit) is sampled
	// again rather than keeping the colour of its title.
	const asked = new Set<string>();

	$effect(() => {
		for (const book of books) {
			const tag = `${book.id}:${book.has_cover ? "c" : "n"}`;
			if (asked.has(tag)) continue;
			asked.add(tag);
			void resolveArt(book).then((resolved) => {
				art = new Map(art).set(book.id, resolved);
			});
		}
	});

	let ordered = $derived(shelfOrder(books, artOf));
</script>

<div
	class="case"
	style:--row="{ROW}px"
	style:--plank="{PLANK}px"
	style:--scale={SCALE}
	style:--swing="{SWING}px"
>
	<div class="boards">
		<!-- Numbered from the right, so each book paints above the ones its jacket
		     can swing over. See BookSpine's .book for why it is not done on hover. -->
		{#each ordered as book, i (book.id)}
			<BookSpine {book} art={artOf(book)} stack={ordered.length - i} {onDelete} />
		{/each}
	</div>
</div>

<style>
	.case {
		/* Only as wide as the books need, until they need the whole page. */
		width: fit-content;
		max-width: 100%;
		/* End panels. The last row's board doubles as the plinth. */
		border-left: calc(12px * var(--scale)) solid #2b211a;
		border-right: calc(12px * var(--scale)) solid #2b211a;
		border-radius: 3px;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.15));
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.04),
			0 18px 40px -24px rgba(0, 0, 0, 0.9);
		/* A tilted book at the end of a row would otherwise widen the document and
		   give a phone a sideways scroll; clipping x leaves the lift in y alone. */
		overflow-x: clip;
	}
	.boards {
		display: flex;
		flex-wrap: wrap;
		align-content: flex-start;
		/* Room at the end of every row for the last book to swing out into. Every
		   other book opens over its right-hand neighbour; the last one on a board
		   has only the end panel there, so the board has to carry the room itself. */
		padding-right: var(--swing);
		background-image:
			/* the books' contact shadow on the board they stand on … */
			repeating-linear-gradient(
				to bottom,
				transparent 0 calc(var(--row) - var(--plank) - 16px * var(--scale)),
				rgba(0, 0, 0, 0.32) calc(var(--row) - var(--plank)),
				transparent calc(var(--row) - var(--plank))
			),
			/* … the lit top face of the board, and its front edge below. */
			repeating-linear-gradient(
				to bottom,
				transparent 0 calc(var(--row) - var(--plank)),
				#4a3a2c calc(var(--row) - var(--plank)) calc(var(--row) - var(--plank) + 3px * var(--scale)),
				#241b14 calc(var(--row) - var(--plank) + 3px * var(--scale)) var(--row)
			);
	}
	/* What the row does when one of its books is opened. Not lean into a gap:
	   the book swings on its planted left edge rather than leaving the row, so
	   no gap opens on its left at all, and the one that opens on its right is
	   swept over by the jacket before anything could fall into it.

	   What is true of the gesture is that the jacket now stands in front of the
	   row, between the light and the books to its right — so they go into its
	   shadow, deepest next door and fading off along the reach of the swing.
	   Their own `.shade` is already the overlay for "this face has lost the
	   light"; it is only being asked here to do it for a different reason.

	   It lives here rather than in BookSpine because it is a fact about a row,
	   and because Svelte scopes a selector within one component: the two
	   `.book`s of a sibling combinator are separate instances, so they have to
	   be reached globally from the board that holds them both. */
	.boards :global(.book:hover + .book .shade),
	.boards :global(.book:has(.volume:focus-visible) + .book .shade) {
		opacity: 0.62;
		transition: opacity 420ms ease 90ms;
	}
	.boards :global(.book:hover + .book + .book .shade),
	.boards :global(.book:has(.volume:focus-visible) + .book + .book .shade) {
		opacity: 0.3;
		transition: opacity 420ms ease 120ms;
	}

	/* A phone has no hover to make room for, and can't spare the width. */
	@media (max-width: 620px) {
		.boards {
			padding-right: 0;
		}
	}
</style>
