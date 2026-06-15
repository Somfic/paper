<script lang="ts">
	let { fraction }: { fraction: number } = $props();
</script>

<div class="progress" aria-hidden="true">
	<div class="bar" style="width:{fraction * 100}%"></div>
</div>

<style>
	.progress {
		flex: 0 0 auto;
		height: 3px;
		background: var(--border);
	}
	.bar {
		height: 100%;
		background: var(--link);
		transition: width 0.2s ease;
	}
</style>
