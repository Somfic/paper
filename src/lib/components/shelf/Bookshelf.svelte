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
		shelfOrder,
		titleArt,
		type SpineArt,
	} from "$lib/shelf/spine";

	let { books, onDelete }: { books: Book[]; onDelete: (id: number) => void } = $props();

	const HEAD = 28; // clearance above the tallest book for the tilt and the ✕
	const PLANK = 11; // board thickness
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

<div class="case" style:--row="{ROW}px" style:--plank="{PLANK}px">
	<div class="boards">
		{#each ordered as book (book.id)}
			<BookSpine {book} art={artOf(book)} {onDelete} />
		{/each}
	</div>
</div>

<style>
	.case {
		/* Only as wide as the books need, until they need the whole page. */
		width: fit-content;
		max-width: 100%;
		/* End panels. The last row's board doubles as the plinth. */
		border-left: 12px solid #2b211a;
		border-right: 12px solid #2b211a;
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
		/* Room at the end of every row for the last book to swing out into. */
		padding-right: 76px;
		background-image:
			/* the books' contact shadow on the board they stand on … */
			repeating-linear-gradient(
				to bottom,
				transparent 0 calc(var(--row) - var(--plank) - 16px),
				rgba(0, 0, 0, 0.32) calc(var(--row) - var(--plank)),
				transparent calc(var(--row) - var(--plank))
			),
			/* … the lit top face of the board, and its front edge below. */
			repeating-linear-gradient(
				to bottom,
				transparent 0 calc(var(--row) - var(--plank)),
				#4a3a2c calc(var(--row) - var(--plank)) calc(var(--row) - var(--plank) + 3px),
				#241b14 calc(var(--row) - var(--plank) + 3px) var(--row)
			);
	}
	/* A phone has no hover to make room for, and can't spare the width. */
	@media (max-width: 620px) {
		.boards {
			padding-right: 0;
		}
	}
</style>
