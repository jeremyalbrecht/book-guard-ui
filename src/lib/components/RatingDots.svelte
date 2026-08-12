<script lang="ts">
	import { m } from '$lib/i18n';

	interface Props {
		value: number | undefined;
		/** Omit to render a read-only rating. */
		onchange?: (rating: number) => void;
		disabled?: boolean;
		/** Announced to screen readers as the group label. Defaults to "Rating". */
		label?: string;
	}

	let { value, onchange, disabled = false, label }: Props = $props();

	const groupLabel = $derived(label ?? m.rating_label());

	const dots = [1, 2, 3, 4, 5];
	const current = $derived(value ?? 0);
	const editable = $derived(Boolean(onchange) && !disabled);
	// Radio groups must be unique per instance or they'd share selection.
	const name = `rating-${crypto.randomUUID()}`;
</script>

{#if editable}
	<fieldset class="dots" aria-describedby={undefined}>
		<legend class="visually-hidden">{groupLabel}</legend>
		{#each dots as dot (dot)}
			<label class="dot-label" class:on={dot <= current}>
				<input
					type="radio"
					{name}
					value={dot}
					checked={dot === current}
					onchange={() => onchange?.(dot)}
				/>
				<span class="dot" aria-hidden="true"></span>
				<span class="visually-hidden">{m.rating_value({ value: dot })}</span>
			</label>
		{/each}
		<span class="readout" aria-hidden="true">{m.rating_readout({ value: current })}</span>
	</fieldset>
{:else}
	<p class="dots static" aria-label="{groupLabel}: {m.rating_value({ value: current })}">
		{#each dots as dot (dot)}
			<span class="dot" class:on={dot <= current} aria-hidden="true"></span>
		{/each}
		<span class="readout" aria-hidden="true">{m.rating_readout({ value: current })}</span>
	</p>
{/if}

<style>
	.dots {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		border: 0;
	}

	.dot-label {
		/* The dot is small; the tap target is not. */
		position: relative;
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		margin-inline-start: calc(var(--space-2) * -1);
		cursor: pointer;
		touch-action: manipulation;
	}

	.dot-label:first-of-type {
		margin-inline-start: 0;
	}

	.dot-label input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}

	.dot {
		width: 13px;
		height: 13px;
		border: 1.5px solid var(--brass);
		border-radius: 50%;
		background: transparent;
		transition:
			background var(--dur-fast) var(--ease-out),
			transform var(--dur-fast) var(--ease-out);
	}

	.dot-label.on .dot,
	.dot.on {
		background: var(--brass);
	}

	.dot-label:active .dot {
		transform: scale(0.88);
	}

	.dot-label:has(input:focus-visible) .dot {
		outline: 2px solid var(--wine);
		outline-offset: 3px;
	}

	.static {
		gap: var(--space-2);
	}

	.readout {
		margin-inline-start: var(--space-3);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: var(--ink-soft);
	}
</style>
