<script lang="ts">
	import { api } from "$lib/api";
	import type { Book } from "$lib/schema";

	let books = $state<Book[]>([]);
	let loading = $state(true);
	let uploading = $state(false);
	let error = $state<string | null>(null);
	let fileInput: HTMLInputElement;

	async function refresh() {
		try {
			books = await api.library.list();
		} catch (e: any) {
			error = e?.message ?? String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		refresh();
	});

	async function onFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		if (!files.length) return;
		uploading = true;
		error = null;
		try {
			for (const file of files) {
				const form = new FormData();
				form.append("file", file);
				const res = await fetch("/api/upload", { method: "POST", body: form });
				if (!res.ok) throw new Error(`upload failed (${res.status})`);
			}
			await refresh();
		} catch (e: any) {
			error = e?.message ?? String(e);
		} finally {
			uploading = false;
			input.value = "";
		}
	}

	async function remove(id: number, ev: MouseEvent) {
		ev.preventDefault();
		ev.stopPropagation();
		try {
			await api.library.delete(id);
			books = books.filter((b) => b.id !== id);
		} catch (e: any) {
			error = e?.message ?? String(e);
		}
	}
</script>

<div class="page">
	<header>
		<h1>📖 paper</h1>
		<button class="upload" onclick={() => fileInput.click()} disabled={uploading}>
			{uploading ? "uploading…" : "+ Add book"}
		</button>
		<input
			bind:this={fileInput}
			type="file"
			accept=".epub,.mobi,.azw3,.fb2,.cbz"
			multiple
			hidden
			onchange={onFiles}
		/>
	</header>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	{#if loading}
		<p class="muted">loading…</p>
	{:else if books.length === 0}
		<div class="empty">
			<p>Your shelf is empty.</p>
			<button onclick={() => fileInput.click()}>Upload an .epub to get started</button>
		</div>
	{:else}
		<div class="shelf">
			{#each books as book (book.id)}
				<a class="card" href={`/book/${book.id}`}>
					<div class="cover">
						<span class="spine">{book.format.toUpperCase()}</span>
						<button
							class="delete"
							title="Remove"
							onclick={(e) => remove(book.id, e)}>✕</button
						>
					</div>
					<div class="title" title={book.title}>{book.title}</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 1100px;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
	}
	header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
	}
	h1 {
		margin: 0;
		font-size: 1.6rem;
		flex: 1;
	}
	.upload {
		font-size: 0.95rem;
		padding: 0.5rem 1rem;
		border-radius: 0.5rem;
		border: 1px solid var(--glow-border-color, #303);
		background: var(--glow-primary, #5b5bd6);
		color: white;
		cursor: pointer;
	}
	.upload:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.error {
		color: #cf222e;
		background: rgba(207, 34, 46, 0.1);
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
	}
	.muted {
		opacity: 0.6;
	}
	.empty {
		text-align: center;
		opacity: 0.7;
		margin-top: 4rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: center;
	}
	.empty button {
		padding: 0.6rem 1.1rem;
		border-radius: 0.5rem;
		border: 1px solid currentColor;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.shelf {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 1.5rem;
	}
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
