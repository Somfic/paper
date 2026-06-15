<script lang="ts">
	import { Button, PopoverMenu, type PopoverMenuEntry } from "glow";
	import type { ReaderSettings } from "$lib/reader/settings.svelte";
	import type { ThemeName } from "$lib/reader/themes";

	let { settings }: { settings: ReaderSettings } = $props();

	const items = $derived<PopoverMenuEntry[]>([
		{ kind: "header", label: "Theme" },
		{
			kind: "radio",
			options: [
				{ value: "light", label: "Light" },
				{ value: "sepia", label: "Sepia" },
				{ value: "dark", label: "Dark" },
			],
			value: settings.theme,
			onChange: (v: string) => (settings.theme = v as ThemeName),
		},
		"divider",
		{ kind: "custom", render: typography },
		"divider",
		{
			kind: "toggle",
			label: "Justify text",
			checked: settings.justify,
			onChange: (v: boolean) => (settings.justify = v),
		},
		{
			kind: "toggle",
			label: "Realistic pages",
			checked: settings.shading,
			onChange: (v: boolean) => (settings.shading = v),
		},
		{ kind: "header", label: "Layout" },
		{
			kind: "radio",
			options: [
				{ value: "paginated", label: "Paged" },
				{ value: "scrolled", label: "Scroll" },
			],
			value: settings.flow,
			onChange: (v: string) =>
				(settings.flow = v as ReaderSettings["flow"]),
		},
		{
			kind: "radio",
			options: [
				{ value: "auto", label: "Two-page" },
				{ value: "single", label: "Single" },
			],
			value: settings.singleColumn ? "single" : "auto",
			onChange: (v: string) => (settings.singleColumn = v === "single"),
		},
	]);
</script>

{#snippet typography()}
	<div class="typo">
		<div class="typo-row">
			<span>Text size</span>
			<div class="stepper">
				<button
					onclick={() => settings.adjust("fontSize", -10)}
					aria-label="Smaller text">A−</button
				>
				<span class="v">{settings.fontSize}%</span>
				<button
					onclick={() => settings.adjust("fontSize", 10)}
					aria-label="Larger text">A+</button
				>
			</div>
		</div>
		<div class="typo-row">
			<span>Line spacing</span>
			<div class="stepper">
				<button
					onclick={() => settings.adjust("lineHeight", -0.1)}
					aria-label="Tighter lines">−</button
				>
				<span class="v">{settings.lineHeight.toFixed(1)}</span>
				<button
					onclick={() => settings.adjust("lineHeight", 0.1)}
					aria-label="Looser lines">+</button
				>
			</div>
		</div>
	</div>
{/snippet}

<PopoverMenu {items} align="right">
	{#snippet trigger()}
		<Button variant="ghost" icon="Type" />
	{/snippet}
</PopoverMenu>

<style>
	/* custom typography block inside the glow PopoverMenu */
	.typo {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.25rem 0.15rem;
	}
	.typo-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		font-size: 0.85rem;
	}
	.stepper {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.stepper button {
		border: 1px solid var(--glow-border-color, rgba(127, 127, 127, 0.3));
		background: transparent;
		color: inherit;
		border-radius: 0.4rem;
		min-width: 1.8rem;
		height: 1.8rem;
		cursor: pointer;
	}
	.stepper .v {
		min-width: 2.8rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
		opacity: 0.7;
	}
</style>
