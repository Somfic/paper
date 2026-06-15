<script lang="ts">
	import { Button, PopoverMenu, type PopoverMenuEntry } from "glow";

	let { items }: { items: PopoverMenuEntry[] } = $props();
</script>

<PopoverMenu {items} align="right">
	{#snippet trigger()}
		<Button variant="ghost" icon="List" />
	{/snippet}
</PopoverMenu>
