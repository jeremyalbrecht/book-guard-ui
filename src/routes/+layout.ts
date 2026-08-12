import { auth } from '$lib/auth.svelte';

/**
 * The app talks to the Go API through the `/api` proxy, which only exists at
 * the HTTP layer (Vite in dev, Traefik in production). Server-side rendering
 * would try to resolve those calls in-process, so everything renders in the
 * browser — which is also what makes the precached app shell work offline.
 */
export const ssr = false;

/**
 * Resolves the session before any page loads. Page loads `await parent()` so
 * they never fire an API request before there is a token to send with it.
 */
export const load = async () => {
	await auth.initialize();
};
