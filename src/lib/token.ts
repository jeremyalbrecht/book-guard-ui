/**
 * Access-token inspection, for diagnosing why the API refused a token.
 *
 * This is **not** verification — the signature is never checked and nothing here
 * grants anything. The API is the only thing that validates a token. This exists
 * because the three ways an OIDC deployment is misconfigured (opaque token,
 * wrong audience, missing groups claim) are indistinguishable from the outside:
 * all three surface as a bare 401 or 403 that looks like a bad password.
 */

export interface TokenDiagnostics {
	/**
	 * False when the provider issued an opaque token. The API validates RFC 9068
	 * JWT access tokens, so an opaque one can never be accepted, whatever else is
	 * configured correctly.
	 */
	isJwt: boolean;
	issuer?: string;
	/** The API requires its own identifier to appear here. */
	audience: string[];
	/** The API requires its configured group to appear here. */
	groups: string[];
	subject?: string;
	expiresAt?: Date;
}

function decodeSegment(segment: string): unknown {
	// base64url → base64, then pad to a multiple of four.
	const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
	const json = atob(padded);
	// atob yields Latin-1; round-trip through UTF-8 so accented names survive.
	const text = new TextDecoder().decode(Uint8Array.from(json, (c) => c.charCodeAt(0)));
	return JSON.parse(text);
}

function stringList(value: unknown): string[] {
	if (typeof value === 'string') return [value];
	if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
	return [];
}

/** Reads what the token claims about itself. Never throws. */
export function inspectToken(token: string | undefined): TokenDiagnostics | null {
	if (!token) return null;

	const parts = token.split('.');
	if (parts.length !== 3) {
		// Opaque: the single most likely misconfiguration, and worth naming plainly.
		return { isJwt: false, audience: [], groups: [] };
	}

	try {
		const payload = decodeSegment(parts[1]!);
		if (typeof payload !== 'object' || payload === null) {
			return { isJwt: false, audience: [], groups: [] };
		}
		const claims = payload as Record<string, unknown>;
		return {
			isJwt: true,
			issuer: typeof claims.iss === 'string' ? claims.iss : undefined,
			audience: stringList(claims.aud),
			groups: stringList(claims.groups),
			subject: typeof claims.sub === 'string' ? claims.sub : undefined,
			expiresAt: typeof claims.exp === 'number' ? new Date(claims.exp * 1000) : undefined
		};
	} catch {
		return { isJwt: false, audience: [], groups: [] };
	}
}

/** Why the API refused, in the order worth telling the user about. */
export type RejectionCause =
	/** The provider issued an opaque token; the API can never accept one. */
	| 'opaque-token'
	/** The token carries no audience, so it was not scoped to this API. */
	| 'no-audience'
	/** Valid token, but it carries no groups and the API requires one. */
	| 'no-groups'
	/** Valid token with groups, but not the group the API requires. */
	| 'wrong-group'
	/** Rejected for some other reason — expiry, issuer, signature. */
	| 'not-accepted';

/**
 * Works out the most useful thing to say about a refusal.
 *
 * Order matters: an opaque token explains every downstream symptom, so it is
 * reported first even on a 403, and a missing audience is a better explanation
 * than "not accepted" for a 401.
 */
export function diagnose(
	reason: 'unauthenticated' | 'forbidden',
	diagnostics: TokenDiagnostics | null
): RejectionCause {
	if (diagnostics && !diagnostics.isJwt) return 'opaque-token';
	if (reason === 'forbidden') {
		return diagnostics && diagnostics.groups.length === 0 ? 'no-groups' : 'wrong-group';
	}
	if (diagnostics && diagnostics.audience.length === 0) return 'no-audience';
	return 'not-accepted';
}
