<script lang="ts">
	import type { Book } from '$lib/types';
	import { displayAuthor, displayTitle } from '$lib/i18n';
	import { isEmptySlot, spineColor, spineHeight, spineWidth } from '$lib/spine';

	let { book }: { book: Book } = $props();

	const empty = $derived(isEmptySlot(book.status));
	const color = $derived(spineColor(book));
	const width = $derived(spineWidth(book));
	const height = $derived(spineHeight(book));
</script>

<!--
	Purely presentational: the shelf decides what tapping a spine does.
	A "to read" book is an empty slot on the shelf, not a filled binding.
-->
<span
	class="spine"
	class:empty
	style:--spine-color={color}
	style:--w="{width}px"
	style:--h="{height}px"
>
	<span class="cloth">
		<span class="title">{displayTitle(book)}</span>
		<span class="author">{displayAuthor(book)}</span>
	</span>
</span>

<style>
	.spine {
		display: block;
		width: var(--w);
		height: var(--h);
		flex: none;
		border-radius: 2px 3px 3px 2px;
		background: var(--spine-color);
		box-shadow:
			inset -3px 0 6px -3px rgb(0 0 0 / 0.5),
			inset 2px 0 0 rgb(255 255 255 / 0.08),
			var(--shadow-1);
		transition:
			transform var(--dur-base) var(--ease-out),
			box-shadow var(--dur-base) var(--ease-out);
	}

	/* Books not yet acquired: a gap in the shelf, dashed and unfilled. */
	.spine.empty {
		background: transparent;
		border: 1px dashed var(--border);
		border-radius: 3px;
		box-shadow: none;
	}

	.cloth {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		height: 100%;
		padding: var(--space-4) 0;
	}

	/* Brass rules top and bottom, the way a cloth binding is stamped. */
	.spine:not(.empty) .cloth {
		border-block: 3px double rgb(212 179 106 / 0.55);
		margin-block: 10px;
		height: calc(100% - 20px);
	}

	/* Spine text runs top-to-bottom, the way a book faces out on a shelf. */
	.title,
	.author {
		writing-mode: vertical-rl;
		text-orientation: mixed;
	}

	.title {
		/* The title gets first claim on the spine; the author takes what is left. */
		flex: 1;
		min-height: 52%;
		overflow: hidden;
		font-family: var(--font-display);
		font-size: 0.9375rem;
		font-weight: 600;
		font-variation-settings: 'opsz' 24;
		letter-spacing: 0.01em;
		color: var(--spine-ink);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.author {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgb(243 236 221 / 0.65);
		flex: 0 1 auto;
		min-height: 0;
		max-height: 40%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.spine.empty .title {
		color: var(--ink-soft);
		font-weight: 500;
	}

	.spine.empty .author {
		color: var(--ink-soft);
		opacity: 0.75;
	}
</style>
