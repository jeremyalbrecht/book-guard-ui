import { listBooks } from '$lib/api';
import { auth } from '$lib/auth.svelte';
import type { Book } from '$lib/types';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, depends, parent }) => {
	depends('exlibris:books');
	// Waits for the layout's auth.initialize(), so the request carries a token.
	await parent();

	// Signed out: the layout renders the sign-in gate instead of this page, so
	// this placeholder is never displayed — it just avoids a pointless 401.
	if (!auth.ready) return { books: Promise.resolve<Book[]>([]) };

	// Streamed, not awaited: the shelf paints its skeleton immediately and
	// fills in when the API answers.
	return { books: listBooks({ fetch }) };
};
