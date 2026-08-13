<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import FeatureCard from '$lib/components/FeatureCard.svelte';
	import SearchField from '$lib/components/SearchField.svelte';
	import Spine from '$lib/components/Spine.svelte';
	import { errorMessage } from '$lib/api';
	import { displayTitle, displayAuthor, m, searchResults, shelfCount } from '$lib/i18n';
	import { search } from '$lib/search';
	import type { Book } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let query = $state('');

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
				<FeatureCard book={featured} />
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
	/* Full styling lives in FeatureCard.svelte; only the loading skeleton's box
	   model is needed here, since that placeholder renders before FeatureCard
	   (whose book isn't known yet) can be shown. */

	.feature {
		padding: var(--space-4);
		overflow: hidden;
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
