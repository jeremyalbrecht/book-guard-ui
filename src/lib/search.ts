import type { Book } from './types';

/**
 * Client-side search over the shelf.
 *
 * The API has no query endpoint, and a personal library is small enough that
 * filtering the already-loaded list is both instant and — unlike a server
 * round-trip — works against the cached shelf while offline.
 */

/** Case- and accent-insensitive, so "carre" finds "le Carré". */
function fold(value: string): string {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();
}

/** Every term must match somewhere, so extra words narrow rather than widen. */
export function matches(book: Book, query: string): boolean {
	const terms = fold(query).split(/\s+/).filter(Boolean);
	if (terms.length === 0) return true;

	const haystack = fold(
		[book.title, book.author, book.isbn ?? '', ...(book.tags ?? []), book.publisher ?? ''].join(' ')
	);
	return terms.every((term) => haystack.includes(term));
}

export function search(books: Book[], query: string): Book[] {
	if (query.trim() === '') return books;
	return books.filter((book) => matches(book, query));
}
