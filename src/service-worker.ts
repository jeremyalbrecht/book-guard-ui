/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

/**
 * Read-only offline support, hand-written on SvelteKit's own primitives rather
 * than a plugin — the caching strategy here is small enough to own outright.
 *
 *  - App shell (build output + static assets): precached on install, served
 *    cache-first. The app installs and opens with no network.
 *  - `GET /api/books` and `GET /api/books/{id}`: network-first with a cache
 *    fallback, so the shelf shows the last synced state offline.
 *  - Everything else, and every non-GET request: straight to the network. No
 *    writes are queued — the UI disables mutating actions while offline.
 */
import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const SHELL_CACHE = `shell-${version}`;
const DATA_CACHE = `data-${version}`;

/**
 * Runtime configuration (identity provider, client id) must never be pinned by
 * the precache, or changing it would need a new build. It is fetched
 * network-first with a cache fallback instead, so an offline launch still has
 * the last known settings.
 */
const CONFIG_PATH = '/config.json';

const SHELL_ASSETS = [...build, ...files].filter((asset) => asset !== CONFIG_PATH);

/**
 * The app renders client-side, so every route is served the same shell
 * document. One copy of it is kept under this key and replayed for any offline
 * navigation, which is what lets a cold launch of `/books/{id}` boot at all.
 */
const SHELL_DOC = '/__shell';

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(SHELL_CACHE)
			.then(async (cache) => {
				await cache.addAll(SHELL_ASSETS);
				// One copy of the shell document, so an offline cold start on any
				// route has something to boot from.
				const shell = await fetch('/');
				if (shell.ok) await cache.put(SHELL_DOC, shell);
			})
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
						.map((key) => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	);
});

/**
 * `GET /api/books` and `GET /api/books/{id}` — the only responses worth keeping.
 *
 * Two same-origin API paths are deliberately left out, and this pattern must not
 * be widened to include them:
 *
 *  - `/api/books/{id}/cover` is authenticated. `networkFirst` stores responses
 *    with `cache.put`, keyed by URL alone, so caching it would leave one
 *    account's images readable by the next account on the same device.
 *  - `/api/search` is per-keystroke and user-driven; caching it would fill the
 *    cache with queries nobody will repeat, and the server already holds a short
 *    result cache of its own.
 */
function isCacheableApiRequest(url: URL): boolean {
	return url.origin === self.location.origin && /^\/api\/books(\/[^/]+)?$/.test(url.pathname);
}

async function networkFirst(request: Request): Promise<Response> {
	const cache = await caches.open(DATA_CACHE);
	try {
		const response = await fetch(request);
		if (response.ok) cache.put(request, response.clone());
		return response;
	} catch (cause) {
		const cached = await cache.match(request);
		if (cached) return cached;
		throw cause;
	}
}

async function cacheFirst(request: Request): Promise<Response> {
	const cache = await caches.open(SHELL_CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;
	return fetch(request);
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

	if (isCacheableApiRequest(url) || url.pathname === CONFIG_PATH) {
		event.respondWith(networkFirst(request));
		return;
	}

	// Tokens and discovery documents live at the identity provider; never cache
	// either, or a stale JWKS would outlive a key rotation.
	if (url.origin !== self.location.origin) return;

	if (url.origin === self.location.origin && SHELL_ASSETS.includes(url.pathname)) {
		event.respondWith(cacheFirst(request));
		return;
	}

	if (request.mode === 'navigate') {
		event.respondWith(navigation(request));
	}
});

async function navigation(request: Request): Promise<Response> {
	const cache = await caches.open(SHELL_CACHE);
	try {
		const response = await fetch(request);
		if (response.ok) cache.put(SHELL_DOC, response.clone());
		return response;
	} catch (cause) {
		const cached = (await cache.match(SHELL_DOC)) ?? (await caches.match(request));
		if (cached) return cached;
		throw cause;
	}
}

export {};
