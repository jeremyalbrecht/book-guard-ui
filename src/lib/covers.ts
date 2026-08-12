/**
 * Object-URL cache for book covers.
 *
 * `GET /books/{id}/cover` is authenticated, so a plain `<img src>` cannot load
 * it — the bytes have to be fetched with the bearer token and turned into an
 * object URL. Those URLs leak unless something revokes them, and the same cover
 * is asked for repeatedly as the user moves shelf → detail → shelf, so both
 * concerns live here rather than in the component.
 *
 * The contract: `URL.revokeObjectURL` is called in exactly one place, and never
 * on an entry a component is still showing.
 */
import { fetchAsset } from './api';

interface Entry {
	/** `null` means "fetched, and there is no cover" — remembered so we don't refetch. */
	objectUrl: string | null;
	/** How many mounted components are showing it. */
	refs: number;
	/** When it last dropped to zero refs, for eviction ordering. */
	released: number;
}

/**
 * How many unused covers to keep. A shelf of ~24 is enough that ordinary
 * back-and-forth navigation never refetches, while bounding memory.
 */
const MAX_IDLE = 24;

const entries = new Map<string, Entry>();
/** Shared promises, so two components mounting at once make one request. */
const inflight = new Map<string, Promise<string | null>>();

function revoke(entry: Entry): void {
	if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
}

/** Trims idle entries once there are more than MAX_IDLE, oldest release first. */
function evictIdle(): void {
	const idle = [...entries.entries()]
		.filter(([, entry]) => entry.refs === 0)
		.sort((a, b) => a[1].released - b[1].released);

	for (const [url, entry] of idle.slice(0, Math.max(0, idle.length - MAX_IDLE))) {
		revoke(entry);
		entries.delete(url);
	}
}

/**
 * Returns an object URL for the cover, or `null` when the book has none.
 * Every successful call must be paired with `releaseCover`.
 */
export async function acquireCover(
	coverUrl: string,
	signal?: AbortSignal
): Promise<string | null> {
	const cached = entries.get(coverUrl);
	if (cached) {
		cached.refs += 1;
		return cached.objectUrl;
	}

	const pending = inflight.get(coverUrl);
	if (pending) {
		const objectUrl = await pending;
		// The entry exists by now unless the shared fetch failed.
		const entry = entries.get(coverUrl);
		if (entry) entry.refs += 1;
		return objectUrl;
	}

	const request = (async () => {
		const blob = await fetchAsset(coverUrl, { signal });
		const objectUrl = blob ? URL.createObjectURL(blob) : null;
		entries.set(coverUrl, { objectUrl, refs: 0, released: Date.now() });
		evictIdle();
		return objectUrl;
	})();

	inflight.set(coverUrl, request);
	try {
		const objectUrl = await request;
		const entry = entries.get(coverUrl);
		if (entry) entry.refs += 1;
		return objectUrl;
	} finally {
		inflight.delete(coverUrl);
	}
}

/**
 * Drops one reference. It deliberately does **not** revoke: keeping the entry is
 * what makes returning to a book free. Eviction happens on the next acquire.
 */
export function releaseCover(coverUrl: string): void {
	const entry = entries.get(coverUrl);
	if (!entry) return;
	entry.refs = Math.max(0, entry.refs - 1);
	if (entry.refs === 0) entry.released = Date.now();
}

/**
 * Revokes everything and forgets it. Called on sign-out and when the API rejects
 * the session, so one account's covers cannot survive into another on a shared
 * device.
 */
export function clearCovers(): void {
	for (const entry of entries.values()) revoke(entry);
	entries.clear();
	inflight.clear();
}
