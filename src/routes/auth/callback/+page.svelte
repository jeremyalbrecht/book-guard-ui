<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/auth.svelte';
	import { m } from '$lib/i18n';

	let error = $state<string | null>(null);

	/**
	 * Only ever return to a path on this origin. The value round-trips through
	 * the provider in the OIDC `state`, and an absolute URL there would turn the
	 * sign-in into an open redirect.
	 */
	function safeReturnTo(path: string): string {
		return path.startsWith('/') && !path.startsWith('//') ? path : '/';
	}

	// The provider redirects here with ?code&state. Exchange it, then send the
	// user back where they were before signing in — replacing this entry so the
	// back button never returns to a spent authorization code.
	$effect(() => {
		void (async () => {
			try {
				const returnTo = safeReturnTo(await auth.completeLogin());
				// A runtime path restored from the sign-in state and origin-checked
				// above; there is no route id for resolve() to work from.
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				await goto(returnTo, { replaceState: true });
			} catch (cause) {
				error = cause instanceof Error ? cause.message : String(cause);
			}
		})();
	});
</script>

<svelte:head><title>{m.auth_completing()}</title></svelte:head>

<div class="callback">
	{#if error}
		<h1>{m.auth_error_title()}</h1>
		<p class="error" role="alert">{error}</p>
		<a class="btn" href={resolve('/')}>{m.error_back_home()}</a>
	{:else}
		<span class="spinner" aria-hidden="true"></span>
		<p role="status" aria-live="polite">{m.auth_completing()}</p>
	{/if}
</div>

<style>
	.callback {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		min-height: 70dvh;
		max-width: 30rem;
		margin-inline: auto;
		padding: var(--space-6) var(--space-4);
		text-align: center;
	}

	p {
		margin: 0;
		color: var(--ink-soft);
	}

	.error {
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--wine-text);
		border-radius: var(--radius-md);
		color: var(--wine-text);
		overflow-wrap: anywhere;
	}

	.spinner {
		width: 22px;
		height: 22px;
		border: 2px solid var(--border);
		border-block-start-color: var(--wine);
		border-radius: 50%;
		animation: spin 700ms linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}
</style>
