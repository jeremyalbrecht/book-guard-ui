import { describe, expect, it, vi } from 'vitest';
import {
	ApiError,
	NetworkError,
	createBook,
	deleteBook,
	fetchAsset,
	getBook,
	listBooks,
	parseBook,
	parseSearchResults,
	searchEditions,
	setAuthTokenProvider,
	updateBook
} from './api';

const BOOK = {
	id: 'b1',
	title: 'La Carte et le Territoire',
	author: 'Michel Houellebecq',
	isbn: '9782081246331',
	status: 'reading',
	created_at: '2026-01-02T10:00:00Z',
	updated_at: '2026-01-03T10:00:00Z'
};

function respond(body: unknown, init: ResponseInit = {}) {
	const status = init.status ?? 200;
	return vi.fn<typeof globalThis.fetch>(async () =>
		status === 204
			? new Response(null, { status })
			: new Response(JSON.stringify(body), {
					status,
					headers: { 'content-type': 'application/json' }
				})
	);
}

describe('parseBook', () => {
	it('keeps every field the contract defines', () => {
		const book = parseBook({ ...BOOK, rating: 4, opinion: 'Excellent.', tags: ['roman'] });
		expect(book).toMatchObject({
			id: 'b1',
			status: 'reading',
			isbn: '9782081246331',
			rating: 4,
			opinion: 'Excellent.',
			tags: ['roman']
		});
	});

	it('drops absent optionals rather than inventing values', () => {
		const book = parseBook(BOOK);
		expect(book.rating).toBeUndefined();
		expect(book.opinion).toBeUndefined();
		expect(book.tags).toBeUndefined();
	});

	it('clamps a rating outside 0–5', () => {
		expect(parseBook({ ...BOOK, rating: 9 }).rating).toBe(5);
		expect(parseBook({ ...BOOK, rating: -2 }).rating).toBe(0);
	});

	it('rejects an unknown status', () => {
		expect(() => parseBook({ ...BOOK, status: 'abandoned' })).toThrow(ApiError);
	});

	it('rejects a payload missing a required field', () => {
		expect(() => parseBook({ id: 'b1', title: 'Sans auteur' })).toThrow(ApiError);
		expect(() => parseBook(null)).toThrow(ApiError);
	});

	it('ignores non-string entries in tags', () => {
		expect(parseBook({ ...BOOK, tags: ['roman', 7, null] }).tags).toEqual(['roman']);
	});
});

describe('requests', () => {
	it('lists books', async () => {
		const fetch = respond([BOOK]);
		const books = await listBooks({ fetch });
		expect(fetch).toHaveBeenCalledWith('/api/books', expect.objectContaining({ method: 'GET' }));
		expect(books).toHaveLength(1);
	});

	it('rejects a list payload that is not an array', async () => {
		await expect(listBooks({ fetch: respond(BOOK) })).rejects.toThrow(ApiError);
	});

	it('sends a JSON body when creating', async () => {
		const fetch = respond(BOOK, { status: 201 });
		await createBook({ isbn: '9782070368224' }, { fetch });
		const [, init] = fetch.mock.calls[0]!;
		if (!init) throw new Error('fetch was called without options');
		expect(init.method).toBe('POST');
		expect(init.body).toBe(JSON.stringify({ isbn: '9782070368224' }));
		expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
	});

	it('patches only the fields it is given', async () => {
		const fetch = respond({ ...BOOK, status: 'read', rating: 5 });
		const book = await updateBook('b1', { status: 'read', rating: 5 }, { fetch });
		const [url, init] = fetch.mock.calls[0]!;
		if (!init) throw new Error('fetch was called without options');
		expect(url).toBe('/api/books/b1');
		expect(init.body).toBe(JSON.stringify({ status: 'read', rating: 5 }));
		expect(book.title).toBe(BOOK.title);
	});

	it('escapes ids in the path', async () => {
		const fetch = respond(BOOK);
		await getBook('a/b', { fetch });
		expect(fetch.mock.calls[0]![0]).toBe('/api/books/a%2Fb');
	});

	it('accepts the empty 204 body from DELETE', async () => {
		await expect(deleteBook('b1', { fetch: respond(null, { status: 204 }) })).resolves.toBeUndefined();
	});
});

describe('error handling', () => {
	it('surfaces the API error message', async () => {
		const error = await getBook('missing', { fetch: respond({ error: 'book not found' }, { status: 404 }) }).catch(
			(cause: unknown) => cause
		);
		expect(error).toBeInstanceOf(ApiError);
		expect((error as ApiError).message).toBe('book not found');
		expect((error as ApiError).notFound).toBe(true);
	});

	it('falls back to a generic message when the error body is unusable', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('<html>502</html>', { status: 502 }));
		const error = (await listBooks({ fetch }).catch((cause: unknown) => cause)) as ApiError;
		expect(error).toBeInstanceOf(ApiError);
		expect(error.message).toBe('Erreur 502.');
	});

	it('reports an unreachable server as a NetworkError', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => {
			throw new TypeError('Failed to fetch');
		});
		await expect(listBooks({ fetch })).rejects.toBeInstanceOf(NetworkError);
	});

	it('lets an abort propagate untouched', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => {
			throw new DOMException('aborted', 'AbortError');
		});
		await expect(listBooks({ fetch })).rejects.toBeInstanceOf(DOMException);
	});
});

describe('fetchAsset', () => {
	it('sends the bearer token and returns the bytes', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(
			async () => new Response(new Blob(['JPEG']), { status: 200 })
		);
		setAuthTokenProvider(async () => 'tok');

		const blob = await fetchAsset('/books/b1/cover', { fetch });

		expect(blob).toBeInstanceOf(Blob);
		const [url, init] = fetch.mock.calls[0]!;
		expect(url).toBe('/api/books/b1/cover');
		expect(init?.headers).toMatchObject({ authorization: 'Bearer tok' });
		setAuthTokenProvider(undefined);
	});

	it('works with no token, as it must when auth is disabled', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(
			async () => new Response(new Blob(['JPEG']), { status: 200 })
		);

		await fetchAsset('/books/b1/cover', { fetch });

		const [, init] = fetch.mock.calls[0]!;
		expect(init?.headers).not.toHaveProperty('authorization');
	});

	it('treats a missing cover as an ordinary absence, not an error', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 404 }));

		await expect(fetchAsset('/books/b1/cover', { fetch })).resolves.toBeNull();
	});

	it('refuses a path outside the asset whitelist', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }));

		// cover_url comes from the server; a bearer token must not follow it anywhere.
		await expect(fetchAsset('https://evil.example/steal', { fetch })).rejects.toBeInstanceOf(
			ApiError
		);
		await expect(fetchAsset('/books', { fetch })).rejects.toBeInstanceOf(ApiError);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('surfaces a server error', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 500 }));

		await expect(fetchAsset('/books/b1/cover', { fetch })).rejects.toBeInstanceOf(ApiError);
	});
});

describe('searchEditions', () => {
	it('sends the query and limit', async () => {
		const fetch = respond({ results: [] });

		await searchEditions('la taupe', { fetch, limit: 8 });

		expect(fetch.mock.calls[0]![0]).toBe('/api/search?q=la%20taupe&limit=8');
	});

	it('maps results', async () => {
		const fetch = respond({
			results: [
				{ isbn: '9782253012061', title: 'La Taupe', author: 'John le Carré', year: 1974, publisher: 'LGF' }
			]
		});

		const hits = await searchEditions('la taupe', { fetch });

		expect(hits).toEqual([
			{ isbn: '9782253012061', title: 'La Taupe', author: 'John le Carré', year: 1974, publisher: 'LGF' }
		]);
	});
});

describe('parseSearchResults', () => {
	it('drops rows nothing could be created from', () => {
		// One bad suggestion must not blank the list while someone is typing.
		const hits = parseSearchResults({
			results: [
				{ isbn: '9782253012061', title: 'Keeper' },
				{ title: 'No ISBN' },
				{ isbn: '', title: 'Empty ISBN' },
				{ isbn: '9780140328721' },
				'not an object',
				null
			]
		});

		expect(hits).toHaveLength(1);
		expect(hits[0]!.title).toBe('Keeper');
	});

	it('drops a nonsensical year rather than showing it', () => {
		const hits = parseSearchResults({ results: [{ isbn: '9782253012061', title: 'X', year: 0 }] });

		expect(hits[0]!.year).toBeUndefined();
	});

	it('returns an empty list for a malformed payload', () => {
		expect(parseSearchResults(null)).toEqual([]);
		expect(parseSearchResults({ results: 'nope' })).toEqual([]);
	});
});
