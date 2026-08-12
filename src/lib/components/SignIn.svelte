<script lang="ts">
	import { auth } from '$lib/auth.svelte';
	import { m } from '$lib/i18n';

	let pending = $state(false);

	async function signIn() {
		pending = true;
		// Navigates away to the provider; `pending` only matters if that fails.
		await auth.login();
		pending = false;
	}
</script>

<div class="gate">
	<div class="mark" aria-hidden="true">
		<span class="spine wine"></span>
		<span class="spine forest"></span>
		<span class="spine ochre"></span>
	</div>

	<h1>{m.auth_signin_title()}</h1>
	<p class="body">{m.auth_signin_body()}</p>

	{#if auth.status === 'error' && auth.error}
		<p class="error" role="alert">
			<strong>{m.auth_error_title()}</strong>
			<span>{auth.error}</span>
		</p>
	{/if}

	<button type="button" class="btn btn-primary" onclick={signIn} disabled={pending}>
		{pending ? m.auth_loading() : m.auth_signin()}
	</button>
</div>

<style>
	.gate {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		min-height: 70dvh;
		max-width: 26rem;
		margin-inline: auto;
		padding: var(--space-6) var(--space-4);
		text-align: center;
	}

	.mark {
		display: flex;
		align-items: flex-end;
		gap: 4px;
		margin-block-end: var(--space-2);
	}

	.spine {
		width: 13px;
		border-radius: 2px;
		box-shadow: var(--shadow-1);
	}

	.wine {
		height: 58px;
		background: var(--spine-wine);
	}

	.forest {
		height: 48px;
		background: var(--spine-forest);
	}

	.ochre {
		height: 64px;
		background: var(--spine-ochre);
	}

	h1 {
		font-size: clamp(1.75rem, 8vw, 2.25rem);
		font-variation-settings: 'opsz' 96;
	}

	.body {
		margin: 0;
		max-width: 30ch;
		color: var(--ink-soft);
	}

	.error {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--wine-text);
		border-radius: var(--radius-md);
		color: var(--wine-text);
		font-size: 0.9375rem;
		/* Provider errors are long and unwrappable otherwise. */
		overflow-wrap: anywhere;
	}
</style>
