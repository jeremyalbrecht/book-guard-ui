# Ex-Libris — UI

Frontend for the self-hosted Ex-Libris book tracker. SvelteKit + TypeScript,
talking to the Go API in `../book-guard`.

## Running

```sh
npm install
npm run dev          # http://localhost:5173
```

The Go API must be running on `http://localhost:8080`. Vite proxies `/api/*` to
it (`server.proxy` in `vite.config.ts`), so the browser only ever makes
same-origin calls and the backend needs no CORS middleware. Point the proxy
elsewhere with `API_ORIGIN=http://host:port npm run dev`.

For local development, run the API with `AUTH_DISABLED=true` and leave
`static/config.json` as shipped (`"oidc": null`) — the app then skips sign-in
entirely and sends no `Authorization` header.

In production the build is static (`npm run build` → `build/`) and Traefik
serves it on the same host as the API, so `/api` resolves without a proxy.

## Commands

| Command             | Does                                       |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Dev server with the `/api` proxy           |
| `npm run build`     | Static build into `build/`                 |
| `npm run preview`   | Serve the built output                     |
| `npm run check`     | `svelte-check` (types + templates)         |
| `npm run lint`      | ESLint                                     |
| `npm run test:unit` | Vitest (API parsing, search, ISBN, covers) |

## Authentication (OIDC)

The app is an OIDC **public client** using Authorization Code + PKCE
(`oidc-client-ts`), and the Go API is the resource server that validates the
JWT access token. Nothing here is Authelia-specific: everything comes from the
provider's discovery document, so Keycloak, Auth0 or Dex work the same way.

Configuration is **runtime**, not build-time — `static/config.json` is read at
boot, so one built artifact is deployed everywhere and repointing it at another
provider is a file edit:

```json
{
	"oidc": {
		"issuer": "https://auth.example.com",
		"clientId": "ex-libris",
		"scope": "openid profile email groups offline_access",
		"audience": "ex-libris-api"
	}
}
```

| Key                     | Notes                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issuer`                | Discovery runs against `{issuer}/.well-known/openid-configuration`.                                                                                         |
| `clientId`              | Public client — no secret, and there is nowhere safe to put one in a static app.                                                                             |
| `scope`                 | `groups` because the API enforces `OIDC_REQUIRED_GROUP`; `offline_access` for the refresh token that keeps a home-screen PWA signed in across relaunches.    |
| `audience`              | Sent as an `audience` request parameter, which some providers need and others ignore. Authelia and Keycloak derive the audience from the granted scopes instead — set it only if yours requires it. |
| `redirectUri`           | Optional; defaults to `{origin}/auth/callback`.                                                                                                             |
| `postLogoutRedirectUri` | Optional; defaults to `{origin}/`.                                                                                                                          |

Set `"oidc": null` to disable sign-in (pairs with `AUTH_DISABLED=true`).

**On the provider side** the client must be public with PKCE (S256), allow the
redirect URI above, grant the scopes above, and — this is the part that bites —
issue **JWT access tokens (RFC 9068)** with an audience matching the API's
`OIDC_AUDIENCE` and a `groups` claim. Authelia issues opaque access tokens by
default; the per-client setting that changes this has moved between releases,
so check its documentation for your version. The API rejects an opaque token
with a 401 that looks exactly like a bad password.

Tokens live in `localStorage` so a relaunched PWA stays signed in. That exposes
the refresh token to XSS, which is an accepted trade-off for a self-hosted
personal app that renders no user-supplied HTML; move to in-memory storage if
that changes.

## Languages

French and English, via paraglide. The switcher is in the top bar; the choice
persists in `localStorage`, and with no stored choice the browser's own
language decides (falling back to French). Copy lives in `messages/fr.json` and
`messages/en.json`; `src/lib/i18n.ts` is the single import point and also holds
date formatting and plural selection.

The message-format plugin has no ICU plural support, so plural forms are
separate `_one`/`_other` messages picked with `Intl.PluralRules`.

## Layout

```
src/
  app.css                 design tokens (light + dark)
  service-worker.ts       app-shell precache + read-only API cache
  lib/
    types.ts              Book, Status, enrichment helpers
    api.ts                typed client for the Go API — the only file that sees raw JSON
    auth.svelte.ts        OIDC session (PKCE, silent renew, sign-out)
    config.ts             runtime config.json loader
    i18n.ts               messages, dates, plurals
    isbn.ts               normalising and recognising ISBN input
    search.ts             client-side shelf filter
    covers.ts             authenticated cover fetch + object-URL cache
    online.svelte.ts      live connectivity state
    spine.ts              binding colour / dimensions per book
    components/           Spine, Cover, RatingDots, OpinionCard, TagInput,
                          SearchField, ScanViewfinder, ThemeToggle,
                          LanguageSwitcher, OfflineBanner, SignIn, AccountMenu
  routes/
    +layout.svelte        topbar, bottom nav, auth gate
    +page.svelte          shelf + search
    books/[id]/           detail
    scan/                 scan barcode or search-and-pick
    auth/callback/        OIDC redirect target
```

## Notes

- **Every book has an ISBN.** It is the only identity a book has, so the API
  rejects a create without one and the database carries a `CHECK` constraint
  against it. The add screen therefore has exactly two ways in: a barcode, or a
  book picked from search.
- **Metadata is the server's job.** A scan posts nothing but the ISBN; the Go
  API's enrichment worker resolves the title, author, publisher, page count and
  cover. A freshly scanned book arrives nameless with
  `enrichment_status: "pending"` — the detail page polls (600 ms, backing off)
  until it lands, and offers a title/author form if enrichment fails.
- **Two searches, doing different jobs.** `src/lib/search.ts` filters the
  *loaded shelf* client-side (accent-folding, so "carre" finds "le Carré") and
  works offline. `searchEditions` in `api.ts` calls the API's `GET /search`,
  which proxies Open Library, to find books you do not own yet.
- **Picking a suggestion sends its title and author too.** Open Library indexes
  *works*, so the ISBN behind a result can belong to another edition entirely —
  picking "Du côté de chez Swann" and posting the ISBN alone really does enrich
  into an English omnibus. Sending the chosen names keeps the book called what
  the person who chose it expects; the server still fills in the publisher, page
  count and cover from the ISBN.
- **Client-side rendering.** `src/routes/+layout.ts` sets `ssr = false`: the
  `/api` proxy exists at the HTTP layer only, and a client-rendered shell is
  what makes the offline precache work.
- **Offline is read-only.** The shelf and book details are served from cache
  when the network is gone; every mutating action is disabled and a banner
  says so. Nothing is queued. `config.json` is deliberately excluded from the
  precache and fetched network-first, so changing it doesn't need a rebuild.
- **Theme.** Follows `prefers-color-scheme` until the toggle is used, then the
  choice is stored in `localStorage` (`exlibris:theme`) and applied in
  `app.html` before first paint.
- **Covers are authenticated.** `GET /books/{id}/cover` needs the bearer token,
  so a plain `<img src>` cannot load it: `src/lib/covers.ts` fetches the bytes
  and hands out object URLs, ref-counted so shelf → detail → shelf never
  refetches, and revoked in exactly one place. `clearCovers()` runs on sign-out
  and on a 401 so one account's images cannot survive into another.
  Spines stay coloured by design — a cover is illegible on a 40px binding, and
  it would mean one authenticated fetch per shelf item.
