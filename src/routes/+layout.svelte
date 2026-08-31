<script lang="ts">
	// glow's theme tokens + base styles. Components (`import { Button } from
	// "glow"`) are used across the app — see the reader header and the shelf page.
	import "glow/styles";

	let { children } = $props();
</script>

<div class="app">
	<main>
		{@render children()}
	</main>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	main {
		flex: 1;
		min-height: 0;
	}
</style>
