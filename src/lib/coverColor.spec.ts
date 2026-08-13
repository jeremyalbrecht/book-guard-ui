import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { averageColor, clearCoverColors, computeCoverColor } from './coverColor';
import { setAuthTokenProvider } from './api';
import { clearCovers } from './covers';

function rgba(r: number, g: number, b: number, a = 255): number[] {
	return [r, g, b, a];
}

function pixels(...px: number[][]): Uint8ClampedArray {
	return new Uint8ClampedArray(px.flat());
}

describe('averageColor', () => {
	it('averages a solid-color image', () => {
		const data = pixels(rgba(200, 40, 40), rgba(200, 40, 40), rgba(200, 40, 40));
		expect(averageColor(data)).toBe('rgb(200 40 40)');
	});

	it('ignores near-white margin pixels so a small colored area is not washed out', () => {
		const data = pixels(
			rgba(250, 248, 245), // white margin
			rgba(250, 248, 245),
			rgba(250, 248, 245),
			rgba(30, 90, 160) // the actual artwork
		);
		expect(averageColor(data)).toBe('rgb(30 90 160)');
	});

	it('ignores near-black text pixels the same way', () => {
		const data = pixels(rgba(10, 10, 10), rgba(10, 10, 10), rgba(180, 120, 60));
		expect(averageColor(data)).toBe('rgb(180 120 60)');
	});

	it('ignores transparent padding pixels', () => {
		const data = pixels(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0), rgba(90, 150, 90));
		expect(averageColor(data)).toBe('rgb(90 150 90)');
	});

	it('falls back to the unfiltered average for a genuinely all-white cover', () => {
		const data = pixels(rgba(255, 255, 255), rgba(255, 255, 255));
		expect(averageColor(data)).toBe('rgb(255 255 255)');
	});

	it('falls back to a neutral gray when every pixel is transparent', () => {
		const data = pixels(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0));
		expect(averageColor(data)).toBe('rgb(128 128 128)');
	});
});

describe('computeCoverColor', () => {
	const COVER = '/books/b1/cover';

	beforeEach(() => {
		setAuthTokenProvider(undefined);
	});

	afterEach(() => {
		clearCovers();
		clearCoverColors();
	});

	it('falls back and does not throw when the cover cannot be fetched', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 404 }))
		);

		await expect(computeCoverColor(COVER, 'rgb(1 2 3)')).resolves.toBe('rgb(1 2 3)');
	});

	it('caches by cover URL instead of refetching', async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
		vi.stubGlobal('fetch', fetchImpl);

		await computeCoverColor(COVER, 'rgb(1 2 3)');
		await computeCoverColor(COVER, 'rgb(1 2 3)');

		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('dedupes concurrent calls for the same cover', async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
		vi.stubGlobal('fetch', fetchImpl);

		await Promise.all([computeCoverColor(COVER, 'rgb(1 2 3)'), computeCoverColor(COVER, 'rgb(1 2 3)')]);

		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});
});
