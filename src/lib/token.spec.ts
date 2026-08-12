import { describe, expect, it } from 'vitest';
import { diagnose, inspectToken } from './token';

/**
 * Builds an unsigned JWT-shaped token; only the payload is ever read.
 * The payload is base64url over **UTF-8 bytes**, as a real provider emits — not
 * `btoa(JSON.stringify(…))`, which silently encodes Latin-1 and would make this
 * helper disagree with every real token containing an accent.
 */
function jwt(claims: Record<string, unknown>): string {
	const encode = (value: unknown) => {
		const bytes = new TextEncoder().encode(JSON.stringify(value));
		const binary = String.fromCharCode(...bytes);
		return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	};
	return `${encode({ alg: 'RS256', typ: 'at+jwt' })}.${encode(claims)}.signature`;
}

describe('inspectToken', () => {
	it('reads the claims the API validates against', () => {
		const diag = inspectToken(
			jwt({
				iss: 'https://auth.example.com',
				aud: ['ex-libris-api'],
				groups: ['book-users'],
				sub: 'u1',
				exp: 1800000000
			})
		);

		expect(diag).toMatchObject({
			isJwt: true,
			issuer: 'https://auth.example.com',
			audience: ['ex-libris-api'],
			groups: ['book-users'],
			subject: 'u1'
		});
		expect(diag!.expiresAt?.getTime()).toBe(1800000000 * 1000);
	});

	it('flags an opaque token, the most likely misconfiguration', () => {
		// Authelia issues these by default, and the API can never accept one.
		const diag = inspectToken('authelia_at_gg7Uk3mNq0');

		expect(diag).toEqual({ isJwt: false, audience: [], groups: [] });
	});

	it('accepts a single-string audience as well as a list', () => {
		expect(inspectToken(jwt({ aud: 'ex-libris-api' }))!.audience).toEqual(['ex-libris-api']);
	});

	it('reports missing claims as empty rather than guessing', () => {
		const diag = inspectToken(jwt({ sub: 'u1' }))!;

		expect(diag.audience).toEqual([]);
		expect(diag.groups).toEqual([]);
	});

	it('survives accented names in claims', () => {
		expect(inspectToken(jwt({ sub: 'jérôme' }))!.subject).toBe('jérôme');
	});

	it('returns null with no token, and does not throw on rubbish', () => {
		expect(inspectToken(undefined)).toBeNull();
		expect(inspectToken('a.b.c')).toEqual({ isJwt: false, audience: [], groups: [] });
	});
});

describe('diagnose', () => {
	const jwtDiag = (over: Partial<ReturnType<typeof inspectToken>> = {}) => ({
		isJwt: true,
		audience: ['ex-libris-api'],
		groups: ['book-users'],
		...over
	});

	it('blames the opaque token first, whatever the status code', () => {
		// It explains every downstream symptom, so it must not be masked by them.
		const opaque = { isJwt: false, audience: [], groups: [] };
		expect(diagnose('unauthenticated', opaque)).toBe('opaque-token');
		expect(diagnose('forbidden', opaque)).toBe('opaque-token');
	});

	it('calls out a token that was never scoped to the API', () => {
		expect(diagnose('unauthenticated', jwtDiag({ audience: [] }))).toBe('no-audience');
	});

	it('distinguishes a missing groups claim from the wrong group', () => {
		// Different fixes: one is a claims-policy problem, the other is membership.
		expect(diagnose('forbidden', jwtDiag({ groups: [] }))).toBe('no-groups');
		expect(diagnose('forbidden', jwtDiag({ groups: ['other'] }))).toBe('wrong-group');
	});

	it('falls back to a generic refusal for expiry or signature failures', () => {
		expect(diagnose('unauthenticated', jwtDiag())).toBe('not-accepted');
		expect(diagnose('unauthenticated', null)).toBe('not-accepted');
	});
});
