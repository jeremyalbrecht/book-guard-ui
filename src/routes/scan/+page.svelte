<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ScanViewfinder from '$lib/components/ScanViewfinder.svelte';
	import { createBook, errorMessage, searchEditions, type SearchResult } from '$lib/api';
	import { m, searchResults, statusLabel } from '$lib/i18n';
	import { online } from '$lib/online.svelte';
	import { normalizeIsbn, isValidIsbn } from '$lib/isbn';
	import type { NewBook, Status } from '$lib/types';

	/** Matches the API's minimum, so typing never provokes a 422. */
	const MIN_QUERY = 3;
	/** Long enough that a fast typist sends one request, short enough to feel live. */
	const DEBOUNCE_MS = 300;
	const LIMIT = 8;

	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let searching = $state(false);
	let searchError = $state<string | null>(null);
	let activeIndex = $state(-1);
	let saving = $state(false);
	let status = $state<Status>('to_read');
	let error = $state<string | null>(null);
	let detected = $state<string | null>(null);
	let input = $state<HTMLInputElement | null>(null);

	const offline = $derived(!online.current);
	const cameraActive = $derived(!saving && !offline);
	// An ISBN identifies a book outright, so it is added rather than searched.
	const queryIsIsbn = $derived(isValidIsbn(query));
	const canSearch = $derived(!queryIsIsbn && query.trim().length >= MIN_QUERY);
	const listOpen = $derived(canSearch && (results.length > 0 || searching || searchError !== null));

	let controller: AbortController | null = null;
	let seq = 0;

	// One effect owns the debounce timer and the in-flight request. Both the abort
	// and the sequence token are needed: aborting alone leaves a window where a
	// superseded response resolves before the abort lands.
	$effect(() => {
		const q = query;
		if (!canSearch) {
			controller?.abort();
			results = [];
			activeIndex = -1;
			searching = false;
			searchError = null;
			return;
		}

		// Pending from the first keystroke, not from when the request fires:
		// otherwise the list flashes "nothing found" during the debounce window,
		// before anything has actually been looked for.
		searching = true;
		searchError = null;

		const timer = setTimeout(() => {
			controller?.abort();
			controller = new AbortController();
			const mine = ++seq;

			void (async () => {
				try {
					const hits = await searchEditions(q, { signal: controller.signal, limit: LIMIT });
					if (mine !== seq) return;
					results = hits;
					activeIndex = -1;
				} catch (cause) {
					if (cause instanceof DOMException && cause.name === 'AbortError') return;
					if (mine !== seq) return;
					results = [];
					searchError = errorMessage(cause);
				} finally {
					if (mine === seq) searching = false;
				}
			})();
		}, DEBOUNCE_MS);

		return () => clearTimeout(timer);
	});

	/**
	 * A scan posts the ISBN alone and lets enrichment name the book. Picking from
	 * the list also passes the chosen title and author: Open Library indexes
	 * works, so the ISBN behind a result can belong to another edition entirely,
	 * and a book must end up named the way the person who chose it expects.
	 */
	async function add(book: NewBook) {
		saving = true;
		error = null;
		try {
			const created = await createBook({ ...book, status });
			await invalidate('exlibris:books');
			await goto(resolve('/books/[id]', { id: created.id }));
		} catch (cause) {
			error = errorMessage(cause);
			detected = null;
			saving = false;
		}
	}

	function onDetect(code: string) {
		if (saving) return;
		const isbn = normalizeIsbn(code);
		if (!isValidIsbn(isbn)) return;
		detected = isbn;
		void add({ isbn });
	}

	function pick(hit: SearchResult) {
		query = '';
		results = [];
		activeIndex = -1;
		void add({ isbn: hit.isbn, title: hit.title, author: hit.author });
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (saving) return;
		if (activeIndex >= 0 && results[activeIndex]) {
			pick(results[activeIndex]);
		} else if (queryIsIsbn) {
			void add({ isbn: normalizeIsbn(query) });
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (!listOpen || results.length === 0) {
			if (event.key === 'Escape') query = '';
			return;
		}
		switch (event.key) {
			case 'ArrowDown':
				// Prevent the caret jumping to the end of the field.
				event.preventDefault();
				activeIndex = (activeIndex + 1) % results.length;
				break;
			case 'ArrowUp':
				event.preventDefault();
				activeIndex = activeIndex <= 0 ? results.length - 1 : activeIndex - 1;
				break;
			case 'Escape':
				event.preventDefault();
				// First press closes the list, a second clears what was typed.
				if (activeIndex >= 0 || results.length > 0) {
					results = [];
					activeIndex = -1;
				} else {
					query = '';
				}
				break;
			case 'Tab':
				activeIndex = -1;
				break;
		}
	}

	function meta(hit: SearchResult): string {
		if (hit.publisher && hit.year) {
			return m.scan_result_meta({ publisher: hit.publisher, year: hit.year });
		}
		return hit.publisher ?? (hit.year ? String(hit.year) : '');
	}
</script>

<svelte:head><title>{m.scan_title()} — Ex-Libris</title></svelte:head>

<div class="page">
	<div>
		<p class="eyebrow">{m.scan_eyebrow()}</p>
		<h1>{m.scan_title()}</h1>
	</div>

	{#if offline}
		<div class="card notice" role="status">
			<p>{m.scan_offline_body()}</p>
			<a class="btn" href={resolve('/')}>{m.scan_offline_action()}</a>
		</div>
	{:else}
		<ScanViewfinder active={cameraActive} ondetect={onDetect} />

		{#if detected}
			<p class="detected" role="status" aria-live="polite">
				<span class="spinner" aria-hidden="true"></span>
				{m.scan_isbn_detected({ isbn: detected })}
			</p>
		{/if}

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<form class="manual" onsubmit={submit}>
			<label for="add-query">{m.scan_manual_label()}</label>
			<p class="help" id="add-query-help">{m.scan_manual_help()}</p>

			<div class="combo">
				<input
					id="add-query"
					bind:this={input}
					bind:value={query}
					{onkeydown}
					class="field"
					role="combobox"
					aria-expanded={listOpen}
					aria-controls="add-results"
					aria-autocomplete="list"
					aria-describedby="add-query-help"
					aria-activedescendant={activeIndex >= 0 ? `add-result-${activeIndex}` : undefined}
					inputmode="search"
					enterkeyhint="search"
					autocomplete="off"
					autocapitalize="none"
					spellcheck="false"
					placeholder="9782070368228"
					disabled={saving}
				/>

				<ul id="add-results" role="listbox" aria-label={m.scan_results_label()} class:open={listOpen}>
					{#if searching && results.length === 0}
						<li class="state" role="presentation">
							<span class="spinner" aria-hidden="true"></span>
							{m.scan_searching()}
						</li>
					{:else if searchError}
						<li class="state error-row" role="presentation">{m.scan_search_failed()}</li>
					{:else if results.length === 0 && canSearch && !searching}
						<li class="state" role="presentation">{m.scan_search_none({ query })}</li>
					{:else}
						{#each results as hit, i (hit.isbn + i)}
							<!-- Keyboard interaction belongs to the combobox input, per the
							     ARIA 1.2 pattern; the option itself is pointer-only. -->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<li
								id="add-result-{i}"
								role="option"
								aria-selected={i === activeIndex}
								aria-label={m.scan_pick({ title: hit.title })}
								class:active={i === activeIndex}
								onclick={() => pick(hit)}
							>
								<span class="hit-title">{hit.title}</span>
								{#if hit.author}<span class="hit-author">{hit.author}</span>{/if}
								{#if meta(hit)}<span class="hit-meta">{meta(hit)}</span>{/if}
							</li>
						{/each}
					{/if}
				</ul>
			</div>

			<p class="visually-hidden" role="status" aria-live="polite">
				{searching ? m.scan_searching() : listOpen ? searchResults(results.length) : ''}
			</p>

			{#if query.trim().length > 0 && query.trim().length < MIN_QUERY && !queryIsIsbn}
				<p class="hint">{m.scan_search_hint()}</p>
			{/if}

			<fieldset class="statuses" disabled={saving}>
				<legend>{m.scan_status_label()}</legend>
				<div class="chips">
					{#each ['to_read', 'reading', 'read'] as const as value (value)}
						<label class="chip" class:on={status === value}>
							<input type="radio" name="status" {value} bind:group={status} />
							{statusLabel(value)}
						</label>
					{/each}
				</div>
			</fieldset>

			<div class="actions">
				<button type="submit" class="btn btn-primary" disabled={saving || !queryIsIsbn}>
					{saving ? m.scan_adding() : m.scan_submit()}
				</button>
			</div>
		</form>
	{/if}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		max-width: 34rem;
		margin-inline: auto;
		padding: var(--space-5) var(--space-4) 0;
	}

	.eyebrow {
		margin: 0 0 var(--space-2);
	}

	h1 {
		font-size: clamp(1.5rem, 6vw, 2rem);
		font-variation-settings: 'opsz' 96;
	}

	label,
	.statuses legend {
		display: block;
		margin-block-start: var(--space-4);
		margin-block-end: var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}

	.manual label:first-of-type {
		margin-block-start: 0;
	}

	.help {
		margin: 0 0 var(--space-3);
		font-size: 0.9375rem;
		color: var(--ink-soft);
	}

	.hint {
		margin: var(--space-2) 0 0;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--ink-soft);
	}

	/* Suggestions ------------------------------------------------------------ */

	.combo {
		position: relative;
	}

	.combo .field {
		width: 100%;
		font-family: var(--font-mono);
	}

	ul {
		display: none;
		margin: var(--space-2) 0 0;
		padding: var(--space-1);
		list-style: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-2);
		/* A long list must not push the status chips off the screen. */
		max-height: 21rem;
		overflow-y: auto;
	}

	ul.open {
		display: block;
	}

	li[role='option'] {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: var(--tap);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		cursor: pointer;
		touch-action: manipulation;
	}

	li[role='option']:hover,
	li[role='option'].active {
		background: color-mix(in srgb, var(--ink) 6%, transparent);
	}

	li[role='option'].active {
		box-shadow: inset 2px 0 0 var(--wine-text);
	}

	.hit-title {
		font-family: var(--font-display);
		font-size: 1.0625rem;
		font-weight: 600;
		line-height: 1.25;
	}

	.hit-author {
		font-size: 0.9375rem;
		font-style: italic;
		color: var(--ink-soft);
	}

	.hit-meta {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}

	.state {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--ink-soft);
	}

	.error-row {
		color: var(--wine-text);
	}

	/* Shared ----------------------------------------------------------------- */

	.notice {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-5);
	}

	.notice p {
		margin: 0;
		color: var(--ink-soft);
	}

	.detected {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: var(--ink-soft);
	}

	.spinner {
		flex: none;
		width: 16px;
		height: 16px;
		border: 2px solid var(--border);
		border-block-start-color: var(--wine);
		border-radius: 50%;
		animation: spin 700ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}

	.statuses {
		padding: 0;
		border: 0;
	}

	.statuses .chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.chip {
		position: relative;
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		margin: 0;
		padding: 0 var(--space-4);
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft);
		cursor: pointer;
		touch-action: manipulation;
	}

	.chip input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}

	.chip.on {
		border-color: var(--wine-text);
		color: var(--wine-text);
		box-shadow: inset 0 0 0 1px var(--wine-text);
	}

	.chip:has(input:focus-visible) {
		outline: 2px solid var(--wine);
		outline-offset: 2px;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-block-start: var(--space-5);
	}

	.error {
		margin: 0;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--wine-text);
		border-radius: var(--radius-md);
		color: var(--wine-text);
	}
</style>
