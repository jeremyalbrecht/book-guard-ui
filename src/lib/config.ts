/**
 * Runtime configuration, fetched from `/config.json` at boot.
 *
 * Deliberately runtime rather than build-time: one built artifact is deployed
 * everywhere, and pointing the app at a different identity provider is a file
 * edit next to the static bundle instead of a rebuild. The service worker
 * fetches this file network-first (see service-worker.ts) so a change takes
 * effect on the next launch rather than being pinned by the precache.
 */

export interface OidcConfig {
	/** Issuer URL — discovery happens at `{issuer}/.well-known/openid-configuration`. */
	issuer: string;
	/** Public client id registered with the provider. */
	clientId: string;
	/**
	 * Space-separated scopes. `offline_access` is what lets the session survive
	 * a page reload without bouncing through the provider; drop it and the app
	 * still works, it just re-authenticates more often.
	 */
	scope?: string;
	/**
	 * Audience the API expects (`OIDC_AUDIENCE` on the Go side). Providers differ
	 * on how they scope access tokens: Authelia and Keycloak derive the audience
	 * from the granted scopes, while others take an explicit `audience` request
	 * parameter — set this when yours needs it, leave it out otherwise.
	 */
	audience?: string;
	/**
	 * RFC 8707 resource indicator. The other convention for asking a provider to
	 * scope an access token to a specific API. Set this *or* `audience` depending
	 * on which your provider honours — the token's `aud` claim is what the API
	 * checks, however it got there.
	 */
	resource?: string;
	/** Overrides the default `{origin}/auth/callback`. */
	redirectUri?: string;
	/** Overrides the default `{origin}/`. */
	postLogoutRedirectUri?: string;
}

export interface AppConfig {
	/** `null` disables authentication entirely — for a Go API run with `AUTH_DISABLED=true`. */
	oidc: OidcConfig | null;
}

const DEFAULT: AppConfig = { oidc: null };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOidc(value: unknown): OidcConfig | null {
	if (!isRecord(value)) return null;
	const { issuer, clientId } = value;
	// Without both of these there is no usable client; treat it as "not configured"
	// rather than half-configuring one and failing later at redirect time.
	if (typeof issuer !== 'string' || !issuer || typeof clientId !== 'string' || !clientId) {
		return null;
	}
	return {
		issuer,
		clientId,
		scope: typeof value.scope === 'string' ? value.scope : undefined,
		audience: typeof value.audience === 'string' ? value.audience : undefined,
		resource: typeof value.resource === 'string' ? value.resource : undefined,
		redirectUri: typeof value.redirectUri === 'string' ? value.redirectUri : undefined,
		postLogoutRedirectUri:
			typeof value.postLogoutRedirectUri === 'string' ? value.postLogoutRedirectUri : undefined
	};
}

let cached: Promise<AppConfig> | undefined;

/** Loads `/config.json` once per session. A missing or unreadable file means "no auth". */
export function loadConfig(): Promise<AppConfig> {
	cached ??= (async () => {
		try {
			const response = await fetch('/config.json', { headers: { accept: 'application/json' } });
			if (!response.ok) return DEFAULT;
			const payload: unknown = await response.json();
			return { oidc: isRecord(payload) ? parseOidc(payload.oidc) : null };
		} catch {
			return DEFAULT;
		}
	})();
	return cached;
}
