<script lang="ts">
	import { m } from '$lib/i18n';

	let { value = $bindable('') }: { value?: string } = $props();

	let input = $state<HTMLInputElement | null>(null);

	function clear() {
		value = '';
		input?.focus();
	}
</script>

<div class="search">
	<label class="visually-hidden" for="shelf-search">{m.search_label()}</label>
	<svg class="glass" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
		<g stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round">
			<circle cx="10.5" cy="10.5" r="6" />
			<path d="M15 15l4.5 4.5" />
		</g>
	</svg>
	<input
		id="shelf-search"
		bind:this={input}
		bind:value
		class="field"
		type="search"
		inputmode="search"
		enterkeyhint="search"
		autocomplete="off"
		autocapitalize="none"
		spellcheck="false"
		placeholder={m.search_placeholder()}
	/>
	{#if value}
		<button type="button" class="clear" onclick={clear} aria-label={m.search_clear()}>
			<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
				<path
					d="M4 4l8 8M12 4l-8 8"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					fill="none"
				/>
			</svg>
		</button>
	{/if}
</div>

<style>
	.search {
		position: relative;
		display: flex;
		align-items: center;
	}

	.glass {
		position: absolute;
		inset-inline-start: var(--space-3);
		color: var(--ink-soft);
		pointer-events: none;
	}

	.field {
		padding-inline: calc(var(--space-3) * 2 + 16px) var(--space-3);
		font-family: var(--font-mono);
		font-size: 1rem;
	}

	/* The browser's own clear affordance would sit under ours. */
	.field::-webkit-search-cancel-button {
		display: none;
	}

	.clear {
		position: absolute;
		inset-inline-end: 2px;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: var(--radius-md);
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
		touch-action: manipulation;
	}

	.clear:hover {
		color: var(--ink);
	}
</style>
