<script lang="ts">
	import { acquireCover, releaseCover } from '$lib/covers';
	import type { Book } from '$lib/types';

	let { book }: { book: Book } = $props();

	let src = $state<string | null>(null);
	let loaded = $state(false);

	// No size props: the component fills whatever box it is given, so each call
	// site keeps its own dimensions and the coloured binding underneath stays
	// visible as the fallback. Nothing moves when the image arrives.
	$effect(() => {
		const url = book.cover_url;
		src = null;
		loaded = false;
		if (!url) return;

		const controller = new AbortController();
		let held = false;

		void (async () => {
			try {
				const objectUrl = await acquireCover(url, controller.signal);
				held = true;
				src = objectUrl;
			} catch {
				// Offline, aborted, or the server refused: the coloured block stands in.
			}
		})();

		return () => {
			controller.abort();
			// The cache owns the object URL's lifetime — revoking here would break
			// any other component showing the same book.
			if (held) releaseCover(url);
		};
	});
</script>

{#if src}
	<img {src} alt="" class:loaded onload={() => (loaded = true)} />
{/if}

<style>
	img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		/* Inherits the parent's rounded corners without repeating them. */
		border-radius: inherit;
		opacity: 0;
		transition: opacity var(--dur-base) var(--ease-out);
	}

	img.loaded {
		opacity: 1;
	}
</style>
