<script lang="ts">
	import type { Book } from "$lib/schema";

	let {
		book,
		onDelete,
	}: { book: Book; onDelete: (id: number) => void } = $props();

	function remove(ev: MouseEvent) {
		ev.preventDefault();
		ev.stopPropagation();
		onDelete(book.id);
	}
</script>

<a class="card" href={`/book/${book.id}`}>
	<div class="cover">
		<span class="spine">{book.format.toUpperCase()}</span>
		<button class="delete" title="Remove" onclick={remove}>✕</button>
	</div>
	<div class="title" title={book.title}>{book.title}</div>
</a>

<style>
	.card {
		text-decoration: none;
		color: inherit;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.cover {
		position: relative;
		aspect-ratio: 2 / 3;
		border-radius: 0.4rem;
		background: linear-gradient(135deg, #4338ca, #7c3aed);
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
		display: flex;
		align-items: flex-end;
		padding: 0.6rem;
		transition: transform 0.15s ease;
	}
	.card:hover .cover {
		transform: translateY(-4px);
	}
	.spine {
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		color: rgba(255, 255, 255, 0.85);
		font-weight: 700;
	}
	.delete {
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		border: none;
		background: rgba(0, 0, 0, 0.45);
		color: white;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.15s ease;
		line-height: 1;
	}
	.card:hover .delete {
		opacity: 1;
	}
	.title {
		font-size: 0.85rem;
		line-height: 1.25;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
