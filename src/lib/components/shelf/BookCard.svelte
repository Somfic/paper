<script lang="ts">
	import * as library from "$lib/library";
	import type { Book } from "$lib/library";
	import { lookupCover } from "$lib/library/covers";
	import GeneratedCover from "./GeneratedCover.svelte";

	let {
		book,
		onDelete,
	}: { book: Book; onDelete: (id: number) => void } = $props();

	let coverUrl = $state<string | null>(null);

	// The only three things that decide which blob we show. Read through
	// primitive `$derived`s rather than straight off the prop: ingest rewrites
	// the whole record, and re-running the effect for a new word count would
	// revoke an object URL the <img> is still loading.
	let coverId = $derived(book.id);
	let hasCover = $derived(!!book.has_cover);
	let isbn = $derived(book.isbn ?? "");

	$effect(() => {
		const [id, stored, lookup] = [coverId, hasCover, isbn];
		let url: string | null = null;
		let cancelled = false;

		(async () => {
			try {
				let blob = stored ? await library.cover(id) : undefined;
				if (!blob && lookup) blob = (await lookupCover(id, lookup)) ?? undefined;
				if (cancelled || !blob) return;
				url = URL.createObjectURL(blob);
				coverUrl = url;
			} catch {
				// No cover is not an error — the generated one takes over.
			}
		})();

		// Object URLs live until revoked, and a shelf leaks them fast otherwise.
		return () => {
			cancelled = true;
			coverUrl = null;
			if (url) URL.revokeObjectURL(url);
		};
	});

	function remove(ev: MouseEvent) {
		ev.preventDefault();
		ev.stopPropagation();
		onDelete(book.id);
	}
</script>

<a class="card" href={`/book/${book.id}`}>
	<div class="cover">
		{#if coverUrl}
			<img src={coverUrl} alt="" />
		{:else}
			<GeneratedCover title={book.title} author={book.author ?? ""} format={book.format} />
		{/if}
		<button class="delete" title="Remove" onclick={remove}>✕</button>
	</div>
	<div class="meta">
		<div class="title" title={book.title}>{book.title}</div>
		{#if book.author}
			<div class="author" title={book.author}>{book.author}</div>
		{/if}
	</div>
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
		overflow: hidden;
		background: #efe9dd;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
		transition: transform 0.15s ease;
	}
	.card:hover .cover {
		transform: translateY(-4px);
	}
	.cover img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
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
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
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
	.author {
		font-size: 0.75rem;
		opacity: 0.65;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
