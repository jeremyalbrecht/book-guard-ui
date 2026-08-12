import { describe, expect, it } from 'vitest';
import { search } from './search';
import type { Book } from './types';

function book(partial: Partial<Book>): Book {
	return {
		id: partial.title ?? 'id',
		title: '',
		author: '',
		status: 'to_read',
		created_at: '',
		updated_at: '',
		...partial
	};
}

const shelf = [
	book({ title: 'La Taupe', author: 'John le Carré', tags: ['espionnage'] }),
	book({ title: '1984', author: 'George Orwell', isbn: '9782070368228' }),
	book({ title: 'La Carte et le Territoire', author: 'Michel Houellebecq' })
];

describe('search', () => {
	it('returns everything for an empty query', () => {
		expect(search(shelf, '   ')).toHaveLength(3);
	});

	it('matches titles and authors case-insensitively', () => {
		expect(search(shelf, 'orwell').map((b) => b.title)).toEqual(['1984']);
		expect(search(shelf, 'TAUPE').map((b) => b.title)).toEqual(['La Taupe']);
	});

	it('ignores accents, so an unaccented query still finds the book', () => {
		expect(search(shelf, 'carre').map((b) => b.title)).toEqual(['La Taupe']);
	});

	it('matches tags and ISBNs', () => {
		expect(search(shelf, 'espionnage').map((b) => b.title)).toEqual(['La Taupe']);
		expect(search(shelf, '9782070368228').map((b) => b.title)).toEqual(['1984']);
	});

	it('narrows with each extra term rather than widening', () => {
		expect(search(shelf, 'la carte')).toHaveLength(1);
		expect(search(shelf, 'la orwell')).toHaveLength(0);
	});

	it('finds nothing for a query that matches nothing', () => {
		expect(search(shelf, 'zzz')).toEqual([]);
	});
});
