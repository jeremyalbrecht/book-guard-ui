/**
 * Sampling a "main colour" out of a book's cover art. Pure math plus the
 * cache that makes it cheap to call repeatedly — the reactive per-book
 * wrapper lives in coverColor.svelte.ts, which is the only part that needs
 * runes.
 */
import { acquireCover, releaseCover } from './covers';

/** Small enough that decode + read stays cheap even for a big shelf. */
const SAMPLE_SIZE = 24;

/** Below this alpha a pixel is effectively transparent padding, not artwork. */
const ALPHA_MIN = 200;

/**
 * Book covers very commonly have plain white/cream margins or black title
 * text; averaging every pixel washes the result toward gray. Filtering out
 * near-white and near-black pixels first biases the average toward whatever
 * colour actually makes the cover recognisable.
 */
const LUMINANCE_MIN = 20;
const LUMINANCE_MAX = 235;

/**
 * Averages RGBA pixel data into a CSS colour, skipping transparent and
 * near-white/near-black pixels. Falls back to an unfiltered average when
 * every pixel got filtered out (a genuinely all-white or all-black cover),
 * so this never returns an empty result.
 */
export function averageColor(pixels: Uint8ClampedArray): string {
	const filtered = sumPixels(pixels, true);
	const { r, g, b, n } = filtered.n > 0 ? filtered : sumPixels(pixels, false);
	if (n === 0) return 'rgb(128 128 128)'; // fully transparent image: neutral gray
	return `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`;
}

function sumPixels(
	pixels: Uint8ClampedArray,
	filter: boolean
): { r: number; g: number; b: number; n: number } {
	let r = 0,
		g = 0,
		b = 0,
		n = 0;
	for (let i = 0; i < pixels.length; i += 4) {
		const [pr, pg, pb, pa] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
		if (pa < ALPHA_MIN) continue;
		if (filter) {
			const luminance = (pr + pg + pb) / 3;
			if (luminance < LUMINANCE_MIN || luminance > LUMINANCE_MAX) continue;
		}
		r += pr;
		g += pg;
		b += pb;
		n++;
	}
	return { r, g, b, n };
}

/** Loads a cover blob URL and samples its dominant colour. */
async function sampleDominantColor(objectUrl: string): Promise<string> {
	const img = new Image();
	img.src = objectUrl;
	await img.decode();

	const canvas = document.createElement('canvas');
	canvas.width = SAMPLE_SIZE;
	canvas.height = SAMPLE_SIZE;
	const ctx = canvas.getContext('2d');
	if (!ctx) return 'rgb(128 128 128)';
	ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

	const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
	return averageColor(data);
}

/**
 * Computed colours are cheap to keep and never go stale (a cover's art
 * doesn't change), so unlike the cover blobs themselves this cache never
 * evicts — a full library is at most a few thousand short strings. A plain
 * Map is deliberate: nothing reads this reactively, it is pure memoization,
 * same as the `entries`/`inflight` maps in covers.ts.
 */
const colorCache = new Map<string, Promise<string>>();

/**
 * Resolves a book's cover colour, computing and caching it once per
 * `cover_url`. Borrows the cover blob from `covers.ts` just long enough to
 * sample it — it does not hold a ref the way a mounted `<Cover>` does.
 */
export function computeCoverColor(coverUrl: string, fallback: string): Promise<string> {
	const cached = colorCache.get(coverUrl);
	if (cached) return cached;

	const promise = (async () => {
		const objectUrl = await acquireCover(coverUrl);
		try {
			return objectUrl ? await sampleDominantColor(objectUrl) : fallback;
		} finally {
			releaseCover(coverUrl);
		}
	})().catch(() => fallback);

	colorCache.set(coverUrl, promise);
	return promise;
}

/** Forgets every computed colour. Called alongside `clearCovers()` on sign-out. */
export function clearCoverColors(): void {
	colorCache.clear();
}
