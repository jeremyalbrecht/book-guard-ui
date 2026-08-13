<script lang="ts">
	import { resolve } from '$app/paths';
	import Cover from '$lib/components/Cover.svelte';
	import { CoverColor } from '$lib/coverColor.svelte';
	import { displayAuthor, displayTitle, formatDate, m } from '$lib/i18n';
	import type { Book } from '$lib/types';

	let { book }: { book: Book } = $props();

	// Its own component (rather than inlined in the shelf page) so the
	// CoverColor instance — which owns an $effect — has a stable component
	// lifecycle to live in, instead of being re-created on every re-evaluation
	// of the shelf's {@const featured = ...}.
	const cover = new CoverColor(() => book);

	const since = $derived(
		m.shelf_since({ date: formatDate(book.created_at, { day: 'numeric', month: 'long' }) })
	);
</script>

<a class="feature card" href={resolve('/books/[id]', { id: book.id })}>
	<span class="ribbon" aria-hidden="true"></span>
	<span class="cover" style:--spine-color={cover.current} aria-hidden="true">
		<Cover {book} />
	</span>
	<span class="meta">
		<span class="title">{displayTitle(book)}</span>
		<span class="author">{displayAuthor(book)}</span>
		<span class="since">{since}</span>
	</span>
</a>

<style>
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
		transition: background-color var(--dur-base) var(--ease-out);
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
</style>
