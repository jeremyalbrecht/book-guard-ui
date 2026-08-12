/**
 * ISBN handling for input, not lookup: the server resolves an ISBN into a
 * title and author (see the enrichment worker in the Go API), so all the
 * client does is tidy up what a barcode scanner or a person typed and decide
 * whether it looks like an ISBN at all.
 *
 * Canonicalising ISBN-10 to ISBN-13 is deliberately the server's job — it is
 * what dedupes editions across users.
 */

/** Strips separators; barcode scanners and humans both add them inconsistently. */
export function normalizeIsbn(raw: string): string {
	return raw.replace(/[\s-]/g, '').toUpperCase();
}

/** ISBN-10 (last digit may be X) or ISBN-13. Length/charset only — not a checksum. */
export function isValidIsbn(raw: string): boolean {
	const isbn = normalizeIsbn(raw);
	return /^\d{9}[\dX]$/.test(isbn) || /^\d{13}$/.test(isbn);
}
