<script lang="ts">
	import { onMount } from "svelte";
	import { Button } from "glow";
	import * as library from "$lib/library";
	import type { Book } from "$lib/library";
	import { backfill, needsIngest } from "$lib/library/ingest";
	import Bookshelf from "$lib/components/shelf/Bookshelf.svelte";

	let books = $state<Book[]>([]);
	let loading = $state(true);
	let adding = $state(false);
	let ingesting = $state(0);
	let error = $state<string | null>(null);
	let fileInput: HTMLInputElement;

	async function refresh() {
		try {
			books = await library.list();
		} catch (e: any) {
			error = e?.message ?? String(e);
		} finally {
			loading = false;
		}
		void runBackfill();
	}

	onMount(() => {
		void refresh();
	});

	/**
	 * Parse anything not parsed yet — books added before the shelf knew how to
	 * read them, and books added a moment ago. Never awaited by the render path:
	 * cards show the filename immediately and fill in as each book lands.
	 */
	async function runBackfill() {
		const pending = books.filter(needsIngest);
		if (!pending.length) return;
		ingesting = pending.length;
		try {
			await backfill(pending, (updated) => {
				books = books.map((b) => (b.id === updated.id ? updated : b));
				ingesting -= 1;
			});
		} catch (e: any) {
			error = e?.message ?? String(e);
		} finally {
			ingesting = 0;
		}
	}

	async function onFiles(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		if (!files.length) return;
		adding = true;
		error = null;
		try {
			for (const file of files) {
				books = [await library.add(file), ...books];
			}
		} catch (e: any) {
			error = e?.message ?? String(e);
		} finally {
			adding = false;
			input.value = "";
		}
		void runBackfill();
	}

	async function remove(id: number) {
		try {
			await library.remove(id);
			books = books.filter((b) => b.id !== id);
		} catch (e: any) {
			error = e?.message ?? String(e);
		}
	}
</script>

<div class="page">
	<header>
		<h1>📖 paper</h1>
		<Button
			icon="Plus"
			label={adding ? "adding…" : "Add book"}
			loading={adding}
			disabled={adding}
			onclick={() => fileInput.click()}
		/>
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
			<Button
				variant="outlined"
				icon="BookOpen"
				label="Add an .epub to get started"
				onclick={() => fileInput.click()}
			/>
		</div>
	{:else}
		{#if ingesting > 0}
			<p class="muted status">reading {ingesting} book{ingesting === 1 ? "" : "s"}…</p>
		{/if}
		<Bookshelf {books} onDelete={remove} />
	{/if}
</div>

<style>
	.page {
		max-width: 1400px;
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
	.error {
		color: #cf222e;
		background: rgba(207, 34, 46, 0.1);
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
	}
	.muted {
		opacity: 0.6;
	}
	.status {
		margin: 0 0 1rem;
		font-size: 0.8rem;
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
</style>
