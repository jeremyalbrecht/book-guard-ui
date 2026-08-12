import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireCover, clearCovers, releaseCover } from './covers';
import { setAuthTokenProvider } from './api';

const COVER = '/books/b1/cover';

let created: string[];
let revoked: string[];
let counter: number;

// Node has no object URLs. Patching the two methods onto the real URL keeps the
// URL constructor intact, which stubbing the global would destroy.
beforeEach(() => {
	created = [];
	revoked = [];
	counter = 0;
	Object.assign(globalThis.URL, {
		createObjectURL: vi.fn(() => {
			const url = `blob:mock/${++counter}`;
			created.push(url);
			return url;
		}),
		revokeObjectURL: vi.fn((url: string) => void revoked.push(url))
	});
	setAuthTokenProvider(undefined);
});

afterEach(() => {
	clearCovers();
});

/** Installs a fetch that answers cover requests, and counts the calls. */
function mockFetch(status = 200) {
	const fetchImpl = vi.fn(async () =>
		status === 200
			? new Response(new Blob(['JPEG']), { status, headers: { 'content-type': 'image/jpeg' } })
			: new Response(null, { status })
	);
	vi.stubGlobal('fetch', fetchImpl);
	return fetchImpl;
}

describe('acquireCover', () => {
	it('fetches the bytes once and reuses the object URL', async () => {
		const fetchImpl = mockFetch();

		const first = await acquireCover(COVER);
		const second = await acquireCover(COVER);

		expect(first).toBe(second);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('shares one request between simultaneous callers', async () => {
		const fetchImpl = mockFetch();

		const [a, b] = await Promise.all([acquireCover(COVER), acquireCover(COVER)]);

		expect(a).toBe(b);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('remembers that a book has no cover instead of asking again', async () => {
		const fetchImpl = mockFetch(404);

		expect(await acquireCover(COVER)).toBeNull();
		expect(await acquireCover(COVER)).toBeNull();
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});
});

describe('releaseCover', () => {
	it('does not revoke — returning to a book must stay free', async () => {
		mockFetch();

		const url = await acquireCover(COVER);
		releaseCover(COVER);

		expect(revoked).toEqual([]);
		expect(await acquireCover(COVER)).toBe(url);
	});

	it('revokes the least recently released once the idle limit is passed', async () => {
		mockFetch();

		// 25 idle entries: one past MAX_IDLE, so exactly the oldest goes.
		for (let i = 0; i < 25; i++) {
			const path = `/books/b${i}/cover`;
			await acquireCover(path);
			releaseCover(path);
		}

		expect(revoked).toEqual([created[0]]);
	});
});

describe('clearCovers', () => {
	it('revokes everything, so one session cannot leak into the next', async () => {
		mockFetch();

		await acquireCover('/books/b1/cover');
		await acquireCover('/books/b2/cover');
		clearCovers();

		expect(revoked).toHaveLength(2);
		expect(revoked).toEqual(created);
	});

	it('refetches after clearing', async () => {
		const fetchImpl = mockFetch();

		await acquireCover(COVER);
		clearCovers();
		await acquireCover(COVER);

		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});
});
