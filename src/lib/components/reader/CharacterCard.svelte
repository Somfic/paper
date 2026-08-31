<script lang="ts">
	import type { CharacterEvidence } from "$lib/reader/characters.svelte";

	let { evidence }: { evidence: CharacterEvidence } = $props();
</script>

<div class="card">
	<p class="meta">
		{evidence.count}
		{evidence.count === 1 ? "mention" : "mentions"} so far{evidence.firstChapter
			? ` · first met in ${evidence.firstChapter}`
			: ""}
	</p>
	{#if evidence.quotes.length}
		<ul class="quotes">
			{#each evidence.quotes as quote}
				<li>
					<span class="text">{quote.text}</span>
					{#if quote.chapter}<span class="where">{quote.chapter}</span>{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">
			No sentence worth quoting from what you have read yet.
		</p>
	{/if}
</div>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.meta {
		margin: 0;
		font-size: 0.72rem;
		letter-spacing: 0.02em;
		color: var(--dim);
	}
	.quotes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.quotes li {
		border-left: 2px solid var(--border);
		padding-left: 0.6rem;
	}
	.text {
		display: block;
		font-size: 0.84rem;
		line-height: 1.45;
		/* the reader's own prose, quoted back — italics keep it from reading as UI */
		font-style: italic;
	}
	.where {
		display: block;
		margin-top: 0.15rem;
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--dim);
	}
	.empty {
		margin: 0;
		font-size: 0.8rem;
		color: var(--dim);
	}
</style>
