/**
 * OIDC authentication for the SPA.
 *
 * Generic OIDC, not Authelia-specific: everything comes from the provider's
 * discovery document and `/config.json`, so Authelia, Keycloak, Auth0 or Dex
 * all work with a different issuer and client id.
 *
 * Flow: Authorization Code + PKCE with a public client — the only correct
 * choice for a static app with no backend to hold a secret. The Go API is an
 * OIDC *resource server* that validates the JWT access token's signature,
 * issuer, audience and `groups` claim, so what matters here is obtaining an
 * access token with the right audience and sending it as a bearer.
 */
import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import { browser } from '$app/environment';
import { loadConfig, type OidcConfig } from './config';
import { setAuthTokenProvider, setForbiddenHandler, setUnauthorizedHandler } from './api';
import { clearCoverColors } from './coverColor';
import { clearCovers } from './covers';
import { inspectToken, type TokenDiagnostics } from './token';

export type AuthStatus =
	/** Still resolving config / restoring a stored session. */
	| 'loading'
	/** No OIDC configured — the API is expected to run with AUTH_DISABLED. */
	| 'disabled'
	/** Configured, but nobody is signed in. */
	| 'anonymous'
	| 'authenticated'
	/**
	 * Signed in as far as the provider is concerned, but the API refused the
	 * token. Signing in again cannot fix it, so this is deliberately not
	 * 'anonymous' — bouncing back to the provider would loop forever.
	 */
	| 'rejected'
	/** Discovery or the redirect callback failed; `error` says why. */
	| 'error';

/** Why the API refused, and what the token actually carried. */
export interface Rejection {
	/** 401: the token was not accepted at all. 403: accepted, but the user is not permitted. */
	reason: 'unauthenticated' | 'forbidden';
	diagnostics: TokenDiagnostics | null;
}

export interface Profile {
	subject: string;
	name?: string;
	groups: string[];
}

const DEFAULT_SCOPE = 'openid profile email groups offline_access';

function profileFrom(user: User): Profile {
	const claims = user.profile;
	const groups = Array.isArray(claims.groups)
		? claims.groups.filter((group): group is string => typeof group === 'string')
		: [];
	return {
		subject: claims.sub,
		name:
			typeof claims.preferred_username === 'string'
				? claims.preferred_username
				: typeof claims.name === 'string'
					? claims.name
					: undefined,
		groups
	};
}

function managerFor(config: OidcConfig): UserManager {
	const origin = location.origin;
	return new UserManager({
		authority: config.issuer,
		client_id: config.clientId,
		redirect_uri: config.redirectUri ?? `${origin}/auth/callback`,
		post_logout_redirect_uri: config.postLogoutRedirectUri ?? `${origin}/`,
		response_type: 'code',
		scope: config.scope ?? DEFAULT_SCOPE,
		// Providers disagree on how an access token is scoped to an API: some take
		// an `audience` parameter, some the RFC 8707 `resource` indicator, and some
		// derive it from the granted scopes and ignore both. Sending whichever is
		// configured is harmless when the provider ignores it; the API only ever
		// checks the resulting `aud` claim.
		extraQueryParams: {
			...(config.audience ? { audience: config.audience } : {}),
			...(config.resource ? { resource: config.resource } : {})
		},
		// Survives a reload and an app relaunch, which a home-screen PWA does
		// constantly. The trade-off is that the refresh token sits in localStorage
		// and is therefore exposed to XSS — acceptable for a self-hosted personal
		// app, and the reason the app ships no user-generated HTML.
		userStore: new WebStorageStateStore({ store: localStorage }),
		automaticSilentRenew: true,
		// Renewal uses the refresh token, so no hidden-iframe silent-redirect page
		// is needed (and none would survive third-party cookie restrictions).
		monitorSession: false
	});
}

class Auth {
	#status = $state<AuthStatus>('loading');
	#profile = $state<Profile | null>(null);
	#error = $state<string | null>(null);
	#rejection = $state<Rejection | null>(null);
	#manager: UserManager | null = null;
	#ready: Promise<void> | undefined;

	get status(): AuthStatus {
		return this.#status;
	}

	get profile(): Profile | null {
		return this.#profile;
	}

	get error(): string | null {
		return this.#error;
	}

	/** Set when the provider signed the user in but the API refused the token. */
	get rejection(): Rejection | null {
		return this.#rejection;
	}

	/** True once the app may talk to the API — signed in, or auth switched off. */
	get ready(): boolean {
		return this.#status === 'authenticated' || this.#status === 'disabled';
	}

	/** Idempotent: the layout awaits this before rendering anything that loads data. */
	initialize(): Promise<void> {
		this.#ready ??= this.#initialize();
		return this.#ready;
	}

	async #initialize(): Promise<void> {
		if (!browser) return;

		const { oidc } = await loadConfig();
		if (!oidc) {
			// No provider configured: the API is expected to run with AUTH_DISABLED,
			// so requests go out without an Authorization header.
			this.#status = 'disabled';
			return;
		}

		const manager = managerFor(oidc);
		this.#manager = manager;

		// The API asks for a token per request rather than being handed one, so it
		// always sees the freshest access token after a silent renew.
		setAuthTokenProvider(async () => (await manager.getUser())?.access_token);
		// A token the provider still considers valid but the API rejects means the
		// session is over as far as this app is concerned.
		setUnauthorizedHandler(() => void this.#onRejected('unauthenticated'));
		setForbiddenHandler(() => void this.#onRejected('forbidden'));

		manager.events.addUserLoaded((user) => {
			this.#profile = profileFrom(user);
			this.#status = 'authenticated';
		});
		manager.events.addUserUnloaded(() => {
			this.#profile = null;
			this.#status = 'anonymous';
		});
		manager.events.addSilentRenewError((cause) => {
			// Renewal failed (refresh token expired or revoked): drop to anonymous
			// rather than leaving the UI thinking it is still signed in.
			this.#error = cause instanceof Error ? cause.message : String(cause);
			void this.#signOutLocally();
		});

		try {
			const user = await manager.getUser();
			if (user && !user.expired) {
				this.#profile = profileFrom(user);
				this.#status = 'authenticated';
			} else {
				this.#status = 'anonymous';
			}
		} catch (cause) {
			this.#status = 'error';
			this.#error = cause instanceof Error ? cause.message : String(cause);
		}
	}

	/**
	 * The API refused a token the provider had just issued.
	 *
	 * The session is deliberately *kept*: signing out and back in would produce
	 * the same token and loop, and the token itself is the evidence needed to
	 * work out which provider setting is wrong. The layout stops rendering pages
	 * in this state, so nothing keeps hammering the API.
	 */
	async #onRejected(reason: Rejection['reason']): Promise<void> {
		if (this.#status === 'rejected') return;
		clearCovers();
		clearCoverColors();
		const token = (await this.#manager?.getUser())?.access_token;
		this.#rejection = { reason, diagnostics: inspectToken(token) };
		this.#status = 'rejected';
	}

	/** Forgets the session locally, without visiting the provider. */
	async #signOutLocally(): Promise<void> {
		// Cover images were fetched with the dead session's token; on a shared
		// device they must not survive into the next one.
		clearCovers();
		clearCoverColors();
		await this.#manager?.removeUser();
		this.#profile = null;
		this.#rejection = null;
		this.#status = 'anonymous';
	}

	/** Sends the browser to the provider. `returnTo` is restored after the callback. */
	async login(returnTo = location.pathname + location.search): Promise<void> {
		if (!this.#manager) return;
		this.#error = null;
		this.#rejection = null;
		try {
			await this.#manager.signinRedirect({ state: { returnTo } });
		} catch (cause) {
			this.#status = 'error';
			this.#error = cause instanceof Error ? cause.message : String(cause);
		}
	}

	/**
	 * Completes the redirect back from the provider.
	 * Returns where the user was headed before signing in.
	 */
	async completeLogin(): Promise<string> {
		await this.initialize();
		if (!this.#manager) return '/';
		const user = await this.#manager.signinRedirectCallback();
		this.#profile = profileFrom(user);
		this.#status = 'authenticated';
		const state = user.state;
		return typeof state === 'object' && state !== null && 'returnTo' in state
			? String((state as { returnTo: unknown }).returnTo)
			: '/';
	}

	/**
	 * Ends the session at the provider when it supports RP-initiated logout, and
	 * locally either way — a provider without an end-session endpoint must not
	 * leave the user still signed in here.
	 */
	async logout(): Promise<void> {
		if (!this.#manager) return;
		clearCovers();
		clearCoverColors();
		this.#rejection = null;
		try {
			await this.#manager.signoutRedirect();
		} catch {
			await this.#manager.removeUser();
			this.#profile = null;
			this.#status = 'anonymous';
		}
	}
}

export const auth = new Auth();
