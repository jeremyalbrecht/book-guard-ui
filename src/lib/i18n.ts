/**
 * One import point for translated copy and the locale-aware formatting that
 * goes with it, so components never reach into `paraglide/` directly.
 */
import { m } from './paraglide/messages';
import { getLocale } from './paraglide/runtime';
import type { Book, Status } from './types';

export { m };

/**
 * The message-format plugin has no ICU plural support, so plural forms are
 * separate messages picked here. Intl.PluralRules keeps this correct per
 * language — French counts 0 as singular, English does not.
 */
function pluralCategory(locale: string, count: number): 'one' | 'other' {
	return new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';
}

export function shelfCount(count: number): string {
	return pluralCategory(getLocale(), count) === 'one'
		? m.shelf_count_one({ count })
		: m.shelf_count_other({ count });
}

export function searchResults(count: number): string {
	if (count === 0) return m.search_results_zero();
	return pluralCategory(getLocale(), count) === 'one'
		? m.search_results_one({ count })
		: m.search_results_other({ count });
}

export function statusLabel(status: Status): string {
	switch (status) {
		case 'to_read':
			return m.status_to_read();
		case 'reading':
			return m.status_reading();
		case 'read':
			return m.status_read();
	}
}

/**
 * What to show for a book the server has not named yet. A scanned book has no
 * title until its ISBN is enriched, and the UI has to say something.
 */
export function displayTitle(book: Book): string {
	return book.title || m.book_unknown_title();
}

export function displayAuthor(book: Book): string {
	return book.author || m.book_unknown_author();
}

/** Dates follow the chosen language, not the browser's locale. */
export function formatDate(
	value: string,
	options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
): string {
	const date = new Date(value);
	if (Number.isNaN(date.valueOf())) return '—';
	return new Intl.DateTimeFormat(getLocale(), options).format(date);
}
