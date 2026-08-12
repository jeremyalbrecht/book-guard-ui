<script lang="ts">
	import { m } from '$lib/i18n';

	interface Props {
		value: string | undefined;
		/** Awaited; the card shows a pending state until it settles. */
		onsave?: (opinion: string) => Promise<void>;
		disabled?: boolean;
		label?: string;
		placeholder?: string;
	}

	let { value, onsave, disabled = false, label, placeholder }: Props = $props();

	const cardLabel = $derived(label ?? m.opinion_label());
	const cardPlaceholder = $derived(placeholder ?? m.opinion_placeholder());

	let editing = $state(false);
	let draft = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);
	let textarea = $state<HTMLTextAreaElement | null>(null);

	const editable = $derived(Boolean(onsave) && !disabled);

	function start() {
		draft = value ?? '';
		error = null;
		editing = true;
		// Focus after the textarea exists in the DOM.
		queueMicrotask(() => textarea?.focus());
	}

	async function save() {
		if (!onsave) return;
		saving = true;
		error = null;
		try {
			await onsave(draft.trim());
			editing = false;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : m.opinion_save_failed();
		} finally {
			saving = false;
		}
	}
</script>

<section class="opinion card" aria-label={cardLabel}>
	<h2 class="eyebrow">{cardLabel}</h2>

	{#if editing}
		<label class="visually-hidden" for="opinion-draft">{cardLabel}</label>
		<textarea
			id="opinion-draft"
			bind:this={textarea}
			bind:value={draft}
			class="field"
			rows="5"
			placeholder={cardPlaceholder}
			disabled={saving}
		></textarea>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<div class="actions">
			<button type="button" class="btn" onclick={() => (editing = false)} disabled={saving}>
				{m.book_cancel()}
			</button>
			<button type="button" class="btn btn-primary" onclick={save} disabled={saving}>
				{saving ? m.book_saving() : m.book_save()}
			</button>
		</div>
	{:else if value}
		<blockquote>
			<p>{value}</p>
		</blockquote>
		{#if editable}
			<div class="actions">
				<button type="button" class="btn" onclick={start}>{m.opinion_edit()}</button>
			</div>
		{/if}
	{:else}
		<p class="empty">{m.opinion_empty()}</p>
		{#if editable}
			<div class="actions">
				<button type="button" class="btn" onclick={start}>{m.opinion_write()}</button>
			</div>
		{/if}
	{/if}
</section>

<style>
	.opinion {
		padding: var(--space-5);
		background: var(--surface-2);
	}

	blockquote {
		position: relative;
		margin: var(--space-4) 0 0;
		padding-inline-start: var(--space-6);
	}

	/* The decorative mark is ornament, not content — hidden from the a11y tree. */
	blockquote::before {
		content: '“';
		position: absolute;
		inset-block-start: -0.35em;
		inset-inline-start: -0.1em;
		font-family: var(--font-display);
		font-size: 4.5rem;
		font-weight: 700;
		line-height: 1;
		color: var(--wine);
		opacity: 0.28;
		pointer-events: none;
	}

	blockquote p {
		margin: 0;
		font-size: 1.1875rem;
		font-style: italic;
		line-height: 1.65;
		/* Keeps the measure readable on wide screens. */
		max-width: 60ch;
	}

	.empty {
		margin: var(--space-3) 0 0;
		color: var(--ink-soft);
		font-style: italic;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-block-start: var(--space-4);
	}

	.error {
		margin: var(--space-3) 0 0;
		color: var(--wine-text);
		font-size: 0.9375rem;
	}

	textarea.field {
		margin-block-start: var(--space-3);
		min-height: 8rem;
		resize: vertical;
		line-height: 1.6;
	}
</style>
