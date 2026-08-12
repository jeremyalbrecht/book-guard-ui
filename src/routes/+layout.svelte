<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AccessDenied from '$lib/components/AccessDenied.svelte';
	import AccountMenu from '$lib/components/AccountMenu.svelte';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import OfflineBanner from '$lib/components/OfflineBanner.svelte';
	import SignIn from '$lib/components/SignIn.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { auth } from '$lib/auth.svelte';
	import { m } from '$lib/i18n';
	import { getLocale } from '$lib/paraglide/runtime';
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();

	// Two destinations for now. A Discover tab arrives when the API has data
	// to back it — an empty placeholder would be worse than no tab.
	const nav = $derived([
		{ href: resolve('/'), label: m.nav_shelf() },
		{ href: resolve('/scan'), label: m.nav_scan() }
	]);

	const path = $derived(page.url.pathname);
	const isCurrent = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

	// The callback route must render before sign-in is complete — it is what
	// completes it.
	const isCallback = $derived(path.startsWith('/auth/'));

	auth.initialize();

	// The document is served pre-rendered with the build-time locale, so the
	// chosen one is applied here instead.
	$effect(() => {
		document.documentElement.lang = getLocale();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<a class="skip" href="#contenu">{m.skip_to_content()}</a>

<OfflineBanner />

<header class="topbar">
	<a class="wordmark" href={resolve('/')}>
		<span>Ex</span><span class="dash">–</span><span class="libris">Libris</span>
	</a>
	<div class="tools">
		<LanguageSwitcher />
		<ThemeToggle />
		{#if auth.status === 'authenticated'}
			<AccountMenu />
		{/if}
	</div>
</header>

<main id="contenu" tabindex="-1">
	{#if isCallback || auth.ready}
		{@render children()}
	{:else if auth.status === 'loading'}
		<p class="booting" role="status" aria-live="polite">{m.auth_loading()}</p>
	{:else if auth.status === 'rejected'}
		<!-- Signing in again would mint the same token and loop, so this is a
		     terminal state until the provider or the API is reconfigured. -->
		<AccessDenied />
	{:else}
		<SignIn />
	{/if}
</main>

{#if auth.ready}
	<nav class="bottom" aria-label={m.nav_main()}>
		{#each nav as item (item.href)}
			<a href={item.href} aria-current={isCurrent(item.href) ? 'page' : undefined}>
				{#if item.href === '/'}
					<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
						<g stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round">
							<rect x="3.5" y="4.5" width="4" height="15" rx="1" />
							<rect x="9.5" y="4.5" width="4" height="15" rx="1" />
							<path d="M16.2 6.1l3.6 1 -3.2 12.4 -3.6-1z" />
						</g>
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
						<g stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round">
							<path d="M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8" />
							<path d="M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16" />
							<path d="M3.5 12h17" />
						</g>
					</svg>
				{/if}
				<span>{item.label}</span>
			</a>
		{/each}
	</nav>
{/if}

<style>
	.skip {
		position: absolute;
		inset-block-start: -100%;
		inset-inline-start: var(--space-3);
		z-index: 100;
		padding: var(--space-3) var(--space-4);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	.skip:focus {
		inset-block-start: var(--space-3);
	}

	.topbar {
		position: sticky;
		inset-block-start: 0;
		z-index: var(--z-nav);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
		padding-block-start: max(var(--space-2), env(safe-area-inset-top));
		background: color-mix(in srgb, var(--bg) 88%, transparent);
		backdrop-filter: blur(8px);
		border-block-end: 1px solid var(--border);
	}

	.tools {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: 0.1em;
		min-height: var(--tap);
		font-family: var(--font-display);
		font-size: 1.375rem;
		font-weight: 600;
		font-variation-settings: 'opsz' 96;
		letter-spacing: -0.015em;
	}

	.dash {
		color: var(--wine);
	}

	.libris {
		font-style: italic;
		font-weight: 500;
	}

	main {
		/* Room for the fixed bottom nav plus the gesture bar. */
		padding-block-end: calc(72px + var(--space-6) + env(safe-area-inset-bottom));
		outline: none;
	}

	.booting {
		display: grid;
		place-items: center;
		min-height: 50dvh;
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}

	.bottom {
		position: fixed;
		inset-block-end: 0;
		inset-inline: 0;
		z-index: var(--z-nav);
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		background: color-mix(in srgb, var(--surface) 94%, transparent);
		backdrop-filter: blur(10px);
		border-block-start: 1px solid var(--border);
		padding-block-end: env(safe-area-inset-bottom);
	}

	.bottom a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		/* Comfortably above the 44px minimum. */
		min-height: 60px;
		padding: var(--space-2);
		color: var(--ink-soft);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		touch-action: manipulation;
		transition: color var(--dur-fast) var(--ease-out);
	}

	/* Current destination: colour plus a rule, never colour alone. */
	.bottom a[aria-current='page'] {
		color: var(--wine-text);
		box-shadow: inset 0 2px 0 var(--wine-text);
	}

	.bottom a:active {
		background: color-mix(in srgb, var(--ink) 6%, transparent);
	}
</style>
