<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Cover from '$lib/components/Cover.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import Spine from '$lib/components/Spine.svelte';
	import { errorMessage } from '$lib/api';
	import { displayTitle, displayAuthor, formatDate, m, searchResults, shelfCount } from '$lib/i18n';
	import { search } from '$lib/search';
	import { spineColor } from '$lib/spine';
	import type { Book } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let query = $state('');

	function since(book: Book): string {
		return m.shelf_since({ date: formatDate(book.created_at, { day: 'numeric', month: 'long' }) });
	}

	/** Most recently touched book still in progress — the one on the nightstand. */
	function currentlyReading(books: Book[]): Book | undefined {
		return books
			.filter((book) => book.status === 'reading')
			.sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
	}

	/** Everything else, oldest first, so the shelf keeps a stable order. */
	function shelved(books: Book[], featured: Book | undefined): Book[] {
		return books
			.filter((book) => book.id !== featured?.id)
			.sort((a, b) => a.created_at.localeCompare(b.created_at));
	}
</script>

<svelte:head><title>{m.shelf_title()} — Ex-Libris</title></svelte:head>

<div class="page">
	{#await data.books}
		<div>
			<p class="eyebrow">{m.shelf_loading()}</p>
			<div class="feature card skeleton" aria-hidden="true"></div>
		</div>
		<div class="shelf" aria-hidden="true">
			{#each [200, 216, 188, 224, 196, 208] as height, i (i)}
				<span class="slot">
					<span class="skeleton spine-skeleton" style:height="{height}px"></span>
				</span>
			{/each}
		</div>
		<p class="visually-hidden" aria-live="polite">{m.shelf_loading_sr()}</p>
	{:then books}
		{@const searching = query.trim() !== ''}
		{@const featured = searching ? undefined : currentlyReading(books)}
		{@const rest = search(shelved(books, featured), query)}

		{#if featured}
			<section aria-labelledby="lecture-en-cours">
				<p class="eyebrow" id="lecture-en-cours">{m.shelf_currently_reading()}</p>
				<a class="feature card" href={resolve('/books/[id]', { id: featured.id })}>
					<span class="ribbon" aria-hidden="true"></span>
					<span class="cover" style:--spine-color={spineColor(featured)} aria-hidden="true">
						<Cover book={featured} />
					</span>
					<span class="meta">
						<span class="title">{displayTitle(featured)}</span>
						<span class="author">{displayAuthor(featured)}</span>
						<span class="since">{since(featured)}</span>
					</span>
				</a>
			</section>
		{/if}

		{#if books.length > 0}
			<SearchField bind:value={query} />
		{/if}

		<section aria-labelledby="etagere">
			<p class="eyebrow" id="etagere" aria-live="polite">
				{searching ? searchResults(rest.length) : shelfCount(rest.length)}
			</p>

			{#if rest.length > 0}
				<div class="shelf">
					{#each rest as book (book.id)}
						<a
							class="slot"
							href={resolve('/books/[id]', { id: book.id })}
							aria-label="{displayTitle(book)}, {displayAuthor(book)}"
						>
							<Spine {book} />
						</a>
					{/each}
				</div>
			{:else if searching}
				<p class="none">{m.search_no_results_body({ query })}</p>
			{:else if !featured}
				<div class="card empty">
					<h2>{m.shelf_empty_title()}</h2>
					<p>{m.shelf_empty_body()}</p>
					<a class="btn btn-primary" href={resolve('/scan')}>{m.shelf_empty_action()}</a>
				</div>
			{:else}
				<p class="none">{m.shelf_nothing_else()}</p>
			{/if}
		</section>
	{:catch error}
		<div class="card empty" role="alert">
			<h2>{m.shelf_error_title()}</h2>
			<p>{errorMessage(error)}</p>
			<button type="button" class="btn" onclick={() => invalidate('exlibris:books')}>
				{m.shelf_retry()}
			</button>
		</div>
	{/await}
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		max-width: 46rem;
		margin-inline: auto;
		padding: var(--space-5) var(--space-4) 0;
	}

	.eyebrow {
		margin: 0 0 var(--space-3);
	}

	/* Currently reading ------------------------------------------------------ */

	.feature {
		position: relative;
		display: flex;
		gap: var(--space-4);
		padding: var(--space-4);
		overflow: hidden;
		transition: transform var(--dur-base) var(--ease-out);
	}

	.feature:active {
		transform: scale(0.99);
	}

	/* The one skeuomorphic touch: a ribbon bookmark tucked into the card. */
	.ribbon {
		position: absolute;
		inset-block-start: 0;
		inset-inline-end: var(--space-5);
		width: 20px;
		height: 56px;
		background: var(--wine);
		clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 74%, 0 100%);
	}

	.cover {
		position: relative;
		display: block;
		flex: none;
		overflow: hidden;
		width: 66px;
		height: 96px;
		border-radius: 2px 4px 4px 2px;
		background: var(--spine-color);
		box-shadow:
			inset 8px 0 0 -6px rgb(255 255 255 / 0.22),
			inset -10px 0 14px -10px rgb(0 0 0 / 0.55),
			var(--shadow-2);
	}

	.meta {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
		padding-inline-end: var(--space-6);
	}

	.title {
		font-family: var(--font-display);
		font-size: 1.3125rem;
		font-weight: 600;
		font-variation-settings: 'opsz' 72;
		line-height: 1.2;
		text-wrap: balance;
	}

	.author {
		color: var(--ink-soft);
		font-size: 1rem;
	}

	.since {
		margin-block-start: var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}

	/* Shelf ------------------------------------------------------------------ */

	.shelf {
		display: flex;
		flex-wrap: wrap;
		align-content: flex-start;
		/* The plank: one rule under every row of spines. */
		background-image: repeating-linear-gradient(
			to bottom,
			transparent 0 232px,
			var(--border) 232px 236px
		);
	}

	.slot {
		display: flex;
		align-items: flex-end;
		height: 236px;
		padding: 0 3px 4px;
		touch-action: manipulation;
		transition: transform var(--dur-base) var(--ease-out);
	}

	/* "Pulling it off the shelf." */
	.slot:hover,
	.slot:focus-visible {
		transform: translateY(-8px);
	}

	.slot:active {
		transform: translateY(-4px);
	}

	.none {
		color: var(--ink-soft);
		font-style: italic;
	}

	/* Empty / error ---------------------------------------------------------- */

	.empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-6) var(--space-5);
	}

	.empty h2 {
		font-size: 1.375rem;
	}

	.empty p {
		margin: 0;
		color: var(--ink-soft);
		max-width: 40ch;
	}

	/* Skeletons -------------------------------------------------------------- */

	.skeleton {
		background: color-mix(in srgb, var(--ink) 8%, var(--surface));
		animation: pulse 1.6s var(--ease-out) infinite;
	}

	.feature.skeleton {
		height: 128px;
		border-color: transparent;
	}

	.spine-skeleton {
		display: block;
		width: 38px;
		border-radius: 2px;
	}

	@keyframes pulse {
		50% {
			opacity: 0.55;
		}
	}
</style>
