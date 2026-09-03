<script lang="ts">
	// The other way onto the shelf: pick a book instead of finding a file for
	// it. Everything on offer here is public domain and comes from Standard
	// Ebooks, so there is no licence to explain and nothing to ask permission
	// for — the only question a card has to answer is whether you want it.
	import { Button, Modal, TextInput } from "glow";
	import type { Book } from "$lib/library";
	import {
		byline,
		coverUrl,
		importBook,
		load,
		search,
		sourceId,
		type CatalogBook,
	} from "$lib/library/catalog";

	let {
		open = $bindable(false),
		shelf,
		onImported,
	}: {
		open?: boolean;
		/** The shelf as it stands, so a book already on it can say so. */
		shelf: Book[];
		/**
		 * Called twice for one book: once when the file has landed and the shelf
		 * can already show it by name, and again once it has been parsed and has
		 * its jacket and length. Both carry the same id.
		 */
		onImported: (book: Book) => void;
	} = $props();

	// A page of cards at a time. The catalogue is ~1500 books and a grid of that
	// many jackets is a lot of DOM to hand a phone for a list you are going to
	// narrow with two words anyway.
	const PAGE = 60;

	let all = $state<CatalogBook[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let query = $state("");
	let shown = $state(PAGE);
	/** The slug being fetched right now, so one card can show the wait. */
	let importing = $state<string | null>(null);

	// Fetched on first open rather than on mount: the catalogue costs a few
	// hundred KB and the shelf owes nothing for a panel nobody opened.
	$effect(() => {
		if (!open || all.length || loading) return;
		loading = true;
		error = null;
		load()
			.then((books) => (all = books))
			.catch((e) => (error = e?.message ?? String(e)))
			.finally(() => (loading = false));
	});

	/** `Book.source` values already on the shelf — see `library/catalog`. */
	let imported = $derived(new Set(shelf.map((b) => b.source).filter(Boolean)));

	let results = $derived(search(all, query));
	let page = $derived(results.slice(0, shown));

	function onQuery(value: string) {
		query = value;
		// A new search starts at the top; keeping the old count would show sixty
		// results of a list that might only have four.
		shown = PAGE;
	}

	async function add(book: CatalogBook) {
		importing = book.slug;
		error = null;
		try {
			onImported(await importBook(book, onImported));
		} catch (e: any) {
			error = e?.message ?? String(e);
		} finally {
			importing = null;
		}
	}
</script>

<Modal
	bind:open
	size="large"
	icon="Library"
	title="Standard Ebooks"
	subtitle="Public domain books, carefully typeset. Added straight to your shelf."
>
	<div class="browse">
		<div class="find">
			<TextInput
				value={query}
				onChange={onQuery}
				icon="Search"
				placeholder="title or author"
				clearable
				loading={loading && !all.length}
			/>
		</div>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		{#if loading && !all.length}
			<p class="muted">fetching the catalogue…</p>
		{:else if !all.length}
			<p class="muted">The catalogue could not be loaded.</p>
		{:else if !results.length}
			<p class="muted">Nothing here matches “{query}”.</p>
		{:else}
			<ul class="grid">
				{#each page as book (book.slug)}
					{@const had = imported.has(sourceId(book))}
					{@const busy = importing === book.slug}
					<li>
						<button
							type="button"
							class="card"
							class:had
							disabled={had || importing !== null}
							aria-label={had ? `${book.title} — already on your shelf` : `Add ${book.title}`}
							onclick={() => add(book)}
						>
							<span class="jacket">
								<img src={coverUrl(book)} alt="" width="224" height="335" loading="lazy" />
								<span class="veil" aria-hidden="true">
									{#if busy}adding…{:else if had}on your shelf{:else}add{/if}
								</span>
							</span>
							<span class="title">{book.title}</span>
							{#if book.authors.length}
								<span class="author">{byline(book)}</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>

			<footer>
				{#if results.length > page.length}
					<Button
						variant="outlined"
						label="Show more"
						onclick={() => { shown += PAGE; }}
					/>
					<p class="muted">showing {page.length} of {results.length}</p>
				{:else}
					<p class="muted">
						{results.length} book{results.length === 1 ? "" : "s"}{query ? " found" : " in the catalogue"}
					</p>
				{/if}
			</footer>
		{/if}
	</div>
</Modal>

<style>
	.browse {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	/* The search field outlives a scroll: the grid is long and the whole point
	   of the field is to make it shorter. */
	.find {
		position: sticky;
		top: 0;
		z-index: 1;
		padding-bottom: 0.75rem;
		/* The modal body's own backdrop, so cards pass behind rather than
		   through. */
		background: var(--glow-surface, #1b1b1f);
	}
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 1.25rem 1rem;
	}
	.card {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.card:disabled {
		cursor: default;
	}
	.jacket {
		position: relative;
		display: block;
		border-radius: 2px;
		overflow: hidden;
		/* A jacket standing on a surface rather than floating on one. */
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.5),
			0 6px 14px -8px rgba(0, 0, 0, 0.8);
	}
	.jacket img {
		display: block;
		width: 100%;
		height: auto;
		/* Until it decodes, a jacket-shaped hole rather than a collapsing row. */
		aspect-ratio: 224 / 335;
		background: rgba(255, 255, 255, 0.06);
	}
	/* What the cover says when you are about to do something to it. */
	.veil {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgba(0, 0, 0, 0.62);
		color: #fff;
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		opacity: 0;
		transition: opacity 160ms ease;
	}
	.card:hover .veil,
	.card:focus-visible .veil,
	/* A book already had, and a book mid-download, both say so without being
	   pointed at — the state is the message, not the invitation. */
	.card.had .veil,
	.card:disabled .veil {
		opacity: 1;
	}
	.card.had .jacket img {
		filter: grayscale(1);
	}
	.card:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 3px;
		border-radius: 2px;
	}
	.title {
		font-size: 0.82rem;
		line-height: 1.25;
	}
	.author {
		font-size: 0.75rem;
		opacity: 0.6;
	}
	footer {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding-top: 0.5rem;
	}
	.muted {
		margin: 0;
		opacity: 0.6;
		font-size: 0.8rem;
	}
	.error {
		margin: 0;
		color: #ff9a9a;
		background: rgba(207, 34, 46, 0.15);
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.85rem;
	}
</style>
