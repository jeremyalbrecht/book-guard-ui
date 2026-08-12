export type Status = 'to_read' | 'reading' | 'read';

/**
 * How far the server has got with looking up this book's ISBN.
 * `skipped` means there is no ISBN to look up.
 */
export type EnrichmentStatus = 'pending' | 'enriched' | 'failed' | 'skipped';

export interface Book {
	id: string;
	isbn?: string;
	/** May be empty while a scanned book is still being enriched, or if enrichment failed. */
	title: string;
	/** May be empty for the same reason as `title`. */
	author: string;
	status: Status;
	/** 0–5 */
	rating?: number;
	opinion?: string;
	tags?: string[];
	/** RFC3339 */
	created_at: string;
	/** RFC3339 */
	updated_at: string;

	// Read-only, filled by the server from the shared per-ISBN edition.
	enrichment_status?: EnrichmentStatus;
	description?: string;
	publisher?: string;
	published_date?: string;
	page_count?: number;
	/** API-relative and authenticated — needs a bearer fetch, not a plain <img src>. */
	cover_url?: string;
}

/**
 * Body of `POST /books`. The ISBN is required — a book without one could never
 * be enriched or named, and the API rejects it.
 *
 * Title and author are optional and only sent when the user picked a specific
 * entry from the search list. Open Library indexes *works*, so the ISBN attached
 * to a result can belong to a different edition — a scan of "Du côté de chez
 * Swann" that enriches into an English omnibus is a real outcome. Sending what
 * the user actually chose keeps the book named the way they expect; the server
 * still fills in the publisher, page count and cover from the ISBN.
 */
export interface NewBook {
	isbn: string;
	title?: string;
	author?: string;
	status?: Status;
}

/** Body of `PATCH /books/{id}` — any subset of the mutable fields. */
export type BookPatch = Partial<
	Pick<Book, 'title' | 'author' | 'isbn' | 'status' | 'rating' | 'opinion' | 'tags'>
>;

/** True while the server is still resolving a scanned book's identity. */
export function isAwaitingMetadata(book: Book): boolean {
	return book.title === '' && book.enrichment_status === 'pending';
}

/** True when the book has no name and the server has nothing left to try. */
export function needsManualNaming(book: Book): boolean {
	return book.title === '' && book.enrichment_status !== 'pending';
}
