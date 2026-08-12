import { describe, expect, it } from 'vitest';
import { isValidIsbn, normalizeIsbn } from './isbn';

describe('normalizeIsbn', () => {
	it('strips the separators scanners and humans add', () => {
		expect(normalizeIsbn('978-2-0812-4633-1')).toBe('9782081246331');
		expect(normalizeIsbn(' 2 08124 633 x ')).toBe('208124633X');
	});
});

describe('isValidIsbn', () => {
	it('accepts ISBN-10 and ISBN-13', () => {
		expect(isValidIsbn('9782081246331')).toBe(true);
		expect(isValidIsbn('2-08-124633-X')).toBe(true);
	});

	it('rejects anything of the wrong length or charset', () => {
		expect(isValidIsbn('12345')).toBe(false);
		expect(isValidIsbn('97820812463311')).toBe(false);
		expect(isValidIsbn('La Carte et le Territoire')).toBe(false);
	});
});
