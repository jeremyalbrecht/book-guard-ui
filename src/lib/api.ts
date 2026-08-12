/**
 * Typed client for the Ex-Libris Go API.
 *
 * This is the only file that touches untyped JSON: everything crossing the
 * boundary is validated here so no `any` leaks into the rest of the app.
 * It knows nothing about the DOM — pass a `fetch` in from SvelteKit `load`
 * functions when server-side rendering.
 *
 * Requests go to `/api/*`, which the dev server proxies to the Go service
 * (see vite.config.ts) and which Traefik routes to it in production.
 */
import type { Book, BookPatch, EnrichmentStatus, NewBook, Status } from './types';

const BASE = '/api';

/**
 * Supplies the bearer token for each request. It is a function rather than a
 * stored string so every call picks up the freshest access token after a silent
 * renew. Unset in local dev, where the Go API runs with AUTH_DISABLED=true.
 */
type TokenProvider = () => Promise<string | undefined>;

let tokenProvider: TokenProvider | undefined;
let onUnauthorized: (() => void) | undefined;
let onForbidden: (() => void) | undefined;

export function setAuthTokenProvider(provider: TokenProvider | undefined): void {
	tokenProvider = provider;
}

/**
 * Called whenever the API rejects a token (401). The auth layer uses it to drop
 * the dead session; this module stays unaware of how that is done.
 */
export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
	onUnauthorized = handler;
}

/**
 * Called whenever the API accepts the token but refuses the user (403 — not in
 * the group the API requires). Distinct from 401 because signing out and back in
 * cannot fix it, so the two must not share a recovery path.
 */
export function setForbiddenHandler(handler: (() => void) | undefined): void {
	onForbidden = handler;
}

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ApiError';
	}

	/** 404 — the book is gone or never existed. */
	get notFound(): boolean {
		return this.status === 404;
	}

	/** 401 — no token, or one the API would not accept. */
	get unauthenticated(): boolean {
		return this.status === 401;
	}

	/** 403 — a valid token, but the user is not in the group the API requires. */
	get forbidden(): boolean {
		return this.status === 403;
	}
}

/** The network never answered: offline, DNS failure, proxy down. */
export class NetworkError extends Error {
	constructor(cause: unknown) {
		super('Le serveur est injoignable.');
		this.name = 'NetworkError';
		this.cause = cause;
	}
}

type FetchLike = typeof globalThis.fetch;

interface RequestOptions {
	method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	body?: unknown;
	fetch?: FetchLike;
	signal?: AbortSignal;
}

const STATUSES: readonly Status[] = ['to_read', 'reading', 'read'];
const ENRICHMENT_STATUSES: readonly EnrichmentStatus[] = ['pending', 'enriched', 'failed', 'skipped'];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Narrows one API payload to `Book`, rejecting anything missing a required field. */
export function parseBook(value: unknown): Book {
	if (!isRecord(value)) throw new ApiError(500, 'Réponse inattendue du serveur.');

	// Title and author may legitimately be empty strings: a book created from a
	// bare ISBN has no name until the server's enrichment supplies one.
	const { id, title, author, status, created_at, updated_at } = value;
	if (
		typeof id !== 'string' ||
		typeof title !== 'string' ||
		typeof author !== 'string' ||
		typeof status !== 'string' ||
		!STATUSES.includes(status as Status)
	) {
		throw new ApiError(500, 'Réponse inattendue du serveur.');
	}

	const enrichment = ENRICHMENT_STATUSES.includes(value.enrichment_status as EnrichmentStatus)
		? (value.enrichment_status as EnrichmentStatus)
		: undefined;
	const rating = typeof value.rating === 'number' ? value.rating : undefined;
	const tags = Array.isArray(value.tags)
		? value.tags.filter((tag): tag is string => typeof tag === 'string')
		: undefined;

	return {
		id,
		title,
		author,
		status: status as Status,
		isbn: optionalString(value.isbn),
		rating: rating === undefined ? undefined : Math.min(5, Math.max(0, rating)),
		opinion: optionalString(value.opinion),
		tags: tags && tags.length > 0 ? tags : undefined,
		created_at: typeof created_at === 'string' ? created_at : '',
		updated_at: typeof updated_at === 'string' ? updated_at : '',
		enrichment_status: enrichment,
		description: optionalString(value.description),
		publisher: optionalString(value.publisher),
		published_date: optionalString(value.published_date),
		page_count: typeof value.page_count === 'number' ? value.page_count : undefined,
		cover_url: optionalString(value.cover_url)
	};
}

export function parseBooks(value: unknown): Book[] {
	if (!Array.isArray(value)) throw new ApiError(500, 'Réponse inattendue du serveur.');
	return value.map(parseBook);
}

/** Pulls the `{error}` message out of a failed response, falling back to a generic one. */
async function errorFrom(response: Response): Promise<ApiError> {
	let message = `Erreur ${response.status}.`;
	try {
		const payload: unknown = await response.json();
		if (isRecord(payload) && typeof payload.error === 'string' && payload.error.length > 0) {
			message = payload.error;
		}
	} catch {
		// Body was empty or not JSON — the generic message stands.
	}
	return new ApiError(response.status, message);
}

async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
	const { method = 'GET', body, fetch: fetchImpl = globalThis.fetch, signal } = options;

	const headers: Record<string, string> = {};
	if (body !== undefined) headers['content-type'] = 'application/json';
	const token = await tokenProvider?.();
	if (token) headers.authorization = `Bearer ${token}`;

	let response: Response;
	try {
		response = await fetchImpl(`${BASE}${path}`, {
			method,
			headers,
			signal,
			body: body === undefined ? undefined : JSON.stringify(body)
		});
	} catch (cause) {
		if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
		throw new NetworkError(cause);
	}

	if (response.status === 401) onUnauthorized?.();
	if (response.status === 403) onForbidden?.();
	if (!response.ok) throw await errorFrom(response);
	if (response.status === 204) return undefined;

	try {
		return await response.json();
	} catch {
		throw new ApiError(response.status, 'Réponse illisible du serveur.');
	}
}

/** Only these paths may be fetched with the bearer token attached. */
const ASSET_PATHS = /^\/books\/[^/]+\/cover$/;

/**
 * Fetches an authenticated binary asset. `request` always parses JSON, so covers
 * need their own path through the same auth and error handling.
 *
 * Returns `null` for 404: a book without a cover is ordinary, not an error.
 *
 * The path is checked against a whitelist because `cover_url` arrives from the
 * server — attaching a bearer token to an arbitrary server-supplied path is how
 * a token gets exfiltrated, and the check costs nothing.
 */
export async function fetchAsset(
	path: string,
	options: { fetch?: FetchLike; signal?: AbortSignal } = {}
): Promise<Blob | null> {
	if (!ASSET_PATHS.test(path)) {
		throw new ApiError(400, `Chemin non autorisé : ${path}`);
	}
	const { fetch: fetchImpl = globalThis.fetch, signal } = options;

	const headers: Record<string, string> = {};
	// Absent when authentication is disabled, exactly as in `request`.
	const token = await tokenProvider?.();
	if (token) headers.authorization = `Bearer ${token}`;

	let response: Response;
	try {
		response = await fetchImpl(`${BASE}${path}`, { headers, signal });
	} catch (cause) {
		if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
		throw new NetworkError(cause);
	}

	if (response.status === 401) onUnauthorized?.();
	if (response.status === 403) onForbidden?.();
	if (response.status === 404) return null;
	if (!response.ok) throw await errorFrom(response);
	return response.blob();
}

export async function health(options: RequestOptions = {}): Promise<boolean> {
	try {
		const fetchImpl = options.fetch ?? globalThis.fetch;
		const response = await fetchImpl(`${BASE}/healthz`, { signal: options.signal });
		return response.ok;
	} catch {
		return false;
	}
}

export async function listBooks(options: RequestOptions = {}): Promise<Book[]> {
	return parseBooks(await request('/books', options));
}

export async function getBook(id: string, options: RequestOptions = {}): Promise<Book> {
	return parseBook(await request(`/books/${encodeURIComponent(id)}`, options));
}

export async function createBook(book: NewBook, options: RequestOptions = {}): Promise<Book> {
	return parseBook(await request('/books', { ...options, method: 'POST', body: book }));
}

export async function updateBook(
	id: string,
	patch: BookPatch,
	options: RequestOptions = {}
): Promise<Book> {
	return parseBook(
		await request(`/books/${encodeURIComponent(id)}`, { ...options, method: 'PATCH', body: patch })
	);
}

export async function deleteBook(id: string, options: RequestOptions = {}): Promise<void> {
	await request(`/books/${encodeURIComponent(id)}`, { ...options, method: 'DELETE' });
}

/**
 * One candidate edition from `GET /search`. The title and author come from the
 * upstream *work* record and are only shown so the user can pick; the ISBN is
 * the only field that survives being chosen.
 */
export interface SearchResult {
	isbn: string;
	title: string;
	author?: string;
	year?: number;
	publisher?: string;
}

/**
 * Narrows a search payload. A malformed row is dropped rather than thrown on:
 * one bad suggestion must not blank the whole list while someone is typing.
 * A row with no ISBN is dropped too — there would be nothing to add.
 */
export function parseSearchResults(value: unknown): SearchResult[] {
	const results = isRecord(value) && Array.isArray(value.results) ? value.results : [];
	const hits: SearchResult[] = [];

	for (const row of results) {
		if (!isRecord(row)) continue;
		const isbn = optionalString(row.isbn);
		const title = optionalString(row.title);
		if (!isbn || !title) continue;
		hits.push({
			isbn,
			title,
			author: optionalString(row.author),
			publisher: optionalString(row.publisher),
			year: typeof row.year === 'number' && row.year > 0 ? row.year : undefined
		});
	}
	return hits;
}

export async function searchEditions(
	query: string,
	options: RequestOptions & { limit?: number } = {}
): Promise<SearchResult[]> {
	const { limit = 10, ...rest } = options;
	const path = `/search?q=${encodeURIComponent(query)}&limit=${limit}`;
	return parseSearchResults(await request(path, rest));
}

/** Human-readable French message for anything thrown by this module. */
export function errorMessage(error: unknown): string {
	if (error instanceof ApiError || error instanceof NetworkError) return error.message;
	return 'Une erreur inattendue est survenue.';
}
