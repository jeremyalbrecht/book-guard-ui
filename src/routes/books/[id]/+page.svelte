<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Cover from '$lib/components/Cover.svelte';
	import OpinionCard from '$lib/components/OpinionCard.svelte';
	import RatingDots from '$lib/components/RatingDots.svelte';
	import TagInput from '$lib/components/TagInput.svelte';
	import { deleteBook, errorMessage, updateBook } from '$lib/api';
	import { displayAuthor, displayTitle, formatDate, m, statusLabel } from '$lib/i18n';
	import { online } from '$lib/online.svelte';
	import { spineColor } from '$lib/spine';
	import { isAwaitingMetadata, needsManualNaming, type BookPatch } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Writable derived: follows whatever `load` last produced (including after
	// navigating to another book), and each mutation writes the API's response
	// straight back over it.
	let book = $derived(data.book);
	let actionError = $state<string | null>(null);
	let busy = $state(false);
	// Only ever shown for a book with no name of its own, so these start empty.
	let draftTitle = $state('');
	let draftAuthor = $state('');

	// Every mutation goes through the API; nothing is queued while offline.
	const readOnly = $derived(!online.current);

	/**
	 * A book added by barcode or from a suggestion arrives nameless and is named
	 * by the server's enrichment a moment later. Poll until it lands rather than
	 * making the user pull to refresh.
	 *
	 * The first check is quick because the user has just landed here and is
	 * watching; later ones back off, since a slow answer means the provider is
	 * struggling and hammering it will not help.
	 */
	let pollAttempt = $state(0);
	$effect(() => {
		if (!book || !isAwaitingMetadata(book) || !online.current) return;
		const delay = Math.min(600 * 2 ** pollAttempt, 5000);
		const timer = setTimeout(() => {
			pollAttempt += 1;
			void invalidate('exlibris:books');
		}, delay);
		return () => clearTimeout(timer);
	});

	/** Applies a patch and refreshes the shelf. Throws so callers can show their own error. */
	async function patch(changes: BookPatch): Promise<void> {
		if (!book) return;
		book = await updateBook(book.id, changes);
		await invalidate('exlibris:books');
	}

	async function act(changes: BookPatch) {
		busy = true;
		actionError = null;
		try {
			await patch(changes);
		} catch (cause) {
			actionError = errorMessage(cause);
		} finally {
			busy = false;
		}
	}

	async function saveName() {
		if (draftTitle.trim() === '' || draftAuthor.trim() === '') return;
		// Naming it makes `needsManualNaming` false, so this block closes itself.
		await act({ title: draftTitle.trim(), author: draftAuthor.trim() });
	}

	async function remove() {
		if (!book) return;
		if (!confirm(m.book_remove_confirm({ title: displayTitle(book) }))) return;
		busy = true;
		actionError = null;
		try {
			await deleteBook(book.id);
			await invalidate('exlibris:books');
			await goto(resolve('/'));
		} catch (cause) {
			actionError = errorMessage(cause);
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{book ? displayTitle(book) : 'Ex-Libris'} — Ex-Libris</title>
</svelte:head>

{#if book}
	{@const awaiting = isAwaitingMetadata(book)}
	{@const unnamed = needsManualNaming(book)}

	<article class="page">
		<a class="back" href={resolve('/')}>
			<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
				<path
					d="M14.5 5.5L8 12l6.5 6.5"
					stroke="currentColor"
					stroke-width="1.9"
					stroke-linecap="round"
					stroke-linejoin="round"
					fill="none"
				/>
			</svg>
			{m.book_back()}
		</a>

		<header class="head">
			<div
				class="cover"
				class:hollow={book.status === 'to_read' && !book.cover_url}
				style:--spine-color={spineColor(book)}
				aria-hidden="true"
			>
				<Cover {book} />
			</div>

			<div class="identity">
				<p class="eyebrow status" class:reading={book.status === 'reading'}>
					{statusLabel(book.status)}
				</p>
				<h1 class:unnamed={!book.title}>{displayTitle(book)}</h1>
				<p class="author">{displayAuthor(book)}</p>
				{#if book.isbn}
					<p class="isbn"><span class="visually-hidden">ISBN&nbsp;</span>{book.isbn}</p>
				{/if}
				{#if book.publisher}
					<p class="isbn">
						{m.book_publisher({
							publisher: book.publisher,
							year: book.published_date ?? '—'
						})}
					</p>
				{/if}
				{#if book.page_count}
					<p class="isbn">{m.book_pages({ count: book.page_count })}</p>
				{/if}
				<p class="added">{m.book_added_on({ date: formatDate(book.created_at) })}</p>
			</div>
		</header>

		{#if actionError}
			<p class="error" role="alert">{actionError}</p>
		{/if}

		{#if readOnly}
			<p class="notice">{m.offline_no_edits()}</p>
		{/if}

		<!-- A scanned book has no name of its own: the server is still resolving
		     its ISBN, or gave up and the user has to say what it is. -->
		{#if awaiting}
			<section class="card state" aria-live="polite">
				<span class="spinner" aria-hidden="true"></span>
				<div>
					<h2>{m.book_pending_title()}</h2>
					<p>{m.book_pending_body()}</p>
				</div>
			</section>
		{:else if unnamed}
			<section class="card state naming">
				<div class="full">
					<h2>{m.book_failed_title()}</h2>
					<p>{m.book_failed_body()}</p>

					<label for="name-title">{m.book_title_field()}</label>
					<input
						id="name-title"
						class="field"
						bind:value={draftTitle}
						disabled={busy || readOnly}
					/>

					<label for="name-author">{m.book_author_field()}</label>
					<input
						id="name-author"
						class="field"
						bind:value={draftAuthor}
						disabled={busy || readOnly}
					/>

					<div class="actions">
						<button
							type="button"
							class="btn btn-primary"
							disabled={busy || readOnly || draftTitle.trim() === '' || draftAuthor.trim() === ''}
							onclick={saveName}
						>
							{busy ? m.book_saving() : m.book_save()}
						</button>
					</div>
				</div>
			</section>
		{/if}

		{#if book.status === 'read'}
			<section class="block" aria-labelledby="note">
				<h2 class="eyebrow" id="note">{m.rating_label()}</h2>
				<RatingDots
					value={book.rating}
					disabled={readOnly || busy}
					onchange={(rating) => act({ rating })}
				/>
			</section>

			<OpinionCard value={book.opinion} disabled={readOnly} onsave={(opinion) => patch({ opinion })} />

			<TagInput tags={book.tags ?? []} disabled={readOnly} onchange={(tags) => patch({ tags })} />
		{:else if book.status === 'reading'}
			<section class="block" aria-labelledby="avancement">
				<h2 class="eyebrow" id="avancement">{m.book_progress()}</h2>
				<p class="progress-note">
					{m.book_started_on({ date: formatDate(book.created_at) })}
				</p>
				<button
					type="button"
					class="btn btn-primary"
					disabled={readOnly || busy}
					onclick={() => act({ status: 'read' })}
				>
					{m.book_mark_read()}
				</button>
			</section>

			<OpinionCard
				value={book.opinion}
				disabled={readOnly}
				label={m.opinion_provisional()}
				placeholder={m.opinion_placeholder_provisional()}
				onsave={(opinion) => patch({ opinion })}
			/>
		{:else}
			<section class="block" aria-labelledby="a-lire">
				<h2 class="eyebrow" id="a-lire">{m.status_to_read()}</h2>
				<p class="progress-note">{m.book_to_read_note()}</p>
				<button
					type="button"
					class="btn btn-primary"
					disabled={readOnly || busy}
					onclick={() => act({ status: 'reading' })}
				>
					{m.book_start_reading()}
				</button>
			</section>
		{/if}

		{#if book.description}
			<section class="block">
				<p class="description">{book.description}</p>
			</section>
		{/if}

		<footer class="danger">
			<button type="button" class="remove" disabled={readOnly || busy} onclick={remove}>
				{m.book_remove()}
			</button>
		</footer>
	</article>
{/if}

<style>
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		max-width: 46rem;
		margin-inline: auto;
		padding: var(--space-4) var(--space-4) 0;
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		align-self: flex-start;
		min-height: var(--tap);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}

	.head {
		display: flex;
		gap: var(--space-5);
		align-items: flex-start;
	}

	.cover {
		position: relative;
		flex: none;
		overflow: hidden;
		width: 108px;
		height: 158px;
		border-radius: 2px 6px 6px 2px;
		background: var(--spine-color);
		box-shadow:
			inset 10px 0 0 -7px rgb(255 255 255 / 0.22),
			inset -14px 0 18px -14px rgb(0 0 0 / 0.55),
			var(--shadow-2);
	}

	/* Not acquired yet — same empty-slot language as the shelf. */
	.cover.hollow {
		background: transparent;
		border: 1px dashed var(--border);
		box-shadow: none;
	}

	.identity {
		min-width: 0;
	}

	.status {
		margin: 0 0 var(--space-2);
	}

	.status.reading {
		color: var(--wine-text);
	}

	h1 {
		font-size: clamp(1.5rem, 6vw, 2rem);
		font-variation-settings: 'opsz' 96;
	}

	/* A placeholder name should not read as the book's actual title. */
	h1.unnamed {
		color: var(--ink-soft);
		font-style: italic;
	}

	.author {
		margin: var(--space-2) 0 0;
		font-size: 1.0625rem;
		font-style: italic;
		color: var(--ink-soft);
	}

	.isbn,
	.added {
		margin: var(--space-2) 0 0;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.06em;
		color: var(--ink-soft);
	}

	.block {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-3);
		padding-block-start: var(--space-2);
		border-block-start: 1px solid var(--border);
	}

	.block .eyebrow {
		margin: 0;
	}

	.progress-note {
		margin: 0;
		color: var(--ink-soft);
	}

	.description {
		margin: 0;
		max-width: 68ch;
		color: var(--ink-soft);
		line-height: 1.7;
	}

	/* Enrichment states ------------------------------------------------------ */

	.state {
		display: flex;
		align-items: flex-start;
		gap: var(--space-4);
		padding: var(--space-5);
		background: var(--surface-2);
	}

	.state h2 {
		font-size: 1.125rem;
	}

	.state p {
		margin: var(--space-2) 0 0;
		color: var(--ink-soft);
	}

	.full {
		width: 100%;
	}

	.naming label {
		display: block;
		margin-block-start: var(--space-4);
		margin-block-end: var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}

	.actions {
		display: flex;
		gap: var(--space-2);
		margin-block-start: var(--space-4);
	}

	.spinner {
		flex: none;
		width: 18px;
		height: 18px;
		margin-block-start: 3px;
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

	.error {
		margin: 0;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--wine-text);
		border-radius: var(--radius-md);
		color: var(--wine-text);
	}

	.notice {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}

	/* Kept well away from the primary actions above. */
	.danger {
		margin-block-start: var(--space-6);
		padding-block-start: var(--space-4);
		border-block-start: 1px solid var(--border);
	}

	.remove {
		min-height: var(--tap);
		padding: 0 var(--space-3);
		border: 0;
		background: none;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--wine-text);
		cursor: pointer;
		touch-action: manipulation;
	}

	.remove:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
</style>
