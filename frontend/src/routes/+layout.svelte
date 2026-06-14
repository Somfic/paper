<script lang="ts">
	// glow's theme tokens + base styles (plain CSS/SCSS entry — safe to import).
	// NOTE: importing glow *components* via the barrel (`import { X } from "glow"`)
	// currently breaks the vite dev server — vite-plugin-svelte can't find the
	// compiled CSS for glow's prebuilt dist components (it looks up the parent
	// module by bare filename, but node_modules deps are keyed with a `?v=` hash,
	// so the lookup misses and PostCSS receives the raw `.svelte`). To revisit
	// when we build real UI with glow.
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
