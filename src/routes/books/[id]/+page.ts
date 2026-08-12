import { error } from '@sveltejs/kit';
import { ApiError, getBook } from '$lib/api';
import { auth } from '$lib/auth.svelte';
import { m } from '$lib/i18n';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch, depends, parent }) => {
	depends('exlibris:books');
	// Waits for the layout's auth.initialize(), so the request carries a token.
	await parent();
	if (!auth.ready) return { book: null };

	try {
		return { book: await getBook(params.id, { fetch }) };
	} catch (cause) {
		if (cause instanceof ApiError && cause.notFound) {
			error(404, m.book_not_found());
		}
		throw cause;
	}
};
