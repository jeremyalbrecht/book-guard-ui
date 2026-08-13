/**
 * Reactive per-book cover colour: the hash-based spineColor immediately, then
 * the real cover colour once computeCoverColor resolves.
 */
import { computeCoverColor } from './coverColor';
import { isEmptySlot, spineColor } from './spine';
import type { Book } from './types';

/**
 * Reactive spine/cover colour for a book: the hash-based fallback
 * immediately, swapped for the real cover colour once it resolves — mirrors
 * how `Cover.svelte` fades its `<img>` in over the coloured block rather than
 * blocking on it. Skips extraction for empty "to read" slots, which render
 * as a transparent dashed box regardless of colour.
 */
export class CoverColor {
	#color = $state('');

	constructor(getBook: () => Pick<Book, 'id' | 'title' | 'cover_url' | 'status'> | null | undefined) {
		$effect(() => {
			const book = getBook();
			if (!book) return;
			const fallback = spineColor(book);
			this.#color = fallback;

			if (!book.cover_url || isEmptySlot(book.status)) return;

			let cancelled = false;
			computeCoverColor(book.cover_url, fallback).then((color) => {
				if (!cancelled) this.#color = color;
			});
			return () => {
				cancelled = true;
			};
		});
	}

	get current(): string {
		return this.#color;
	}
}
