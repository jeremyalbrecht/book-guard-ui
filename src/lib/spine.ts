import type { Book, Status } from './types';

/**
 * Cloth colours for spines and cover blocks. Constant across themes — a book's
 * binding doesn't change colour when the room lights dim.
 */
export const SPINE_COLORS = [
	'var(--spine-wine)',
	'var(--spine-forest)',
	'var(--spine-ochre)',
	'var(--spine-indigo)'
] as const;

/** Stable 32-bit hash so a given book always gets the same binding. */
function hash(seed: string): number {
	let h = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return Math.abs(h);
}

export function spineColor(book: Pick<Book, 'id' | 'title'>): string {
	return SPINE_COLORS[hash(book.id || book.title) % SPINE_COLORS.length];
}

/** Slight width variation, so a shelf reads as books rather than a bar chart. */
export function spineWidth(book: Pick<Book, 'id' | 'title'>): number {
	return 34 + (hash(`w${book.id || book.title}`) % 4) * 5;
}

/** Slight height variation, anchored at the shelf base. */
export function spineHeight(book: Pick<Book, 'id' | 'title'>): number {
	return 188 + (hash(`h${book.id || book.title}`) % 5) * 8;
}

export function isEmptySlot(status: Status): boolean {
	return status === 'to_read';
}
