<script lang="ts">
	import { m } from '$lib/i18n';

	interface Props {
		tags: string[];
		/** Called with the full new list; omit for a read-only display. */
		onchange?: (tags: string[]) => Promise<void>;
		disabled?: boolean;
		label?: string;
	}

	let { tags, onchange, disabled = false, label }: Props = $props();

	const groupLabel = $derived(label ?? m.tags_label());

	let draft = $state('');
	let pending = $state(false);
	let error = $state<string | null>(null);

	const editable = $derived(Boolean(onchange) && !disabled);

	async function commit(next: string[]) {
		if (!onchange) return;
		pending = true;
		error = null;
		try {
			await onchange(next);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : m.tags_update_failed();
		} finally {
			pending = false;
		}
	}

	async function add() {
		const tag = draft.trim().toLowerCase();
		if (!tag) return;
		if (tags.includes(tag)) {
			draft = '';
			return;
		}
		draft = '';
		await commit([...tags, tag]);
	}

	function onkeydown(event: KeyboardEvent) {
		// Comma is the other natural separator when typing several in a row.
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			void add();
		} else if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
			void commit(tags.slice(0, -1));
		}
	}
</script>

<section class="tags" aria-label={groupLabel}>
	<h2 class="eyebrow">{groupLabel}</h2>

	<ul class="chips">
		{#each tags as tag (tag)}
			<li class="chip">
				<span>{tag}</span>
				{#if editable}
					<button
						type="button"
						class="remove"
						disabled={pending}
						aria-label={m.tags_remove({ tag })}
						onclick={() => commit(tags.filter((t) => t !== tag))}
					>
						<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
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
			</li>
		{:else}
			{#if !editable}
				<li class="none">{m.tags_none()}</li>
			{/if}
		{/each}
	</ul>

	{#if editable}
		<div class="add">
			<label class="visually-hidden" for="tag-draft">{m.tags_add_label()}</label>
			<input
				id="tag-draft"
				class="field"
				bind:value={draft}
				{onkeydown}
				disabled={pending}
				placeholder={m.tags_placeholder()}
				autocomplete="off"
				autocapitalize="none"
				spellcheck="false"
			/>
			<button type="button" class="btn" onclick={add} disabled={pending || draft.trim() === ''}>
				{m.tags_add()}
			</button>
		</div>
		<p class="hint">{m.tags_hint()}</p>
	{/if}

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
</section>

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: var(--space-3) 0 0;
		padding: 0;
		list-style: none;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0.3rem var(--space-2) 0.3rem var(--space-3);
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}

	.none {
		color: var(--ink-soft);
		font-style: italic;
	}

	.remove {
		display: grid;
		place-items: center;
		/* Visually small, but the hit area covers the whole chip end. */
		width: 26px;
		height: 26px;
		margin: -6px -4px -6px 0;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
		touch-action: manipulation;
	}

	.remove:hover:not(:disabled) {
		color: var(--wine-text);
	}

	.add {
		display: flex;
		gap: var(--space-2);
		margin-block-start: var(--space-3);
	}

	.add .field {
		flex: 1;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 1rem;
	}

	.hint {
		margin: var(--space-2) 0 0;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--ink-soft);
	}

	.error {
		margin: var(--space-2) 0 0;
		color: var(--wine-text);
		font-size: 0.9375rem;
	}
</style>
