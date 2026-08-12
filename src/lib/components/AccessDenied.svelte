<script lang="ts">
	import { auth } from '$lib/auth.svelte';
	import { m } from '$lib/i18n';
	import { diagnose, type RejectionCause } from '$lib/token';

	const rejection = $derived(auth.rejection);
	const diag = $derived(rejection?.diagnostics ?? null);

	// The three ways an OIDC deployment is wrong all arrive as a bare 401 or 403.
	// The rules live in `diagnose` so they can be tested; this only renders them.
	const cause = $derived(rejection ? diagnose(rejection.reason, diag) : null);

	const MESSAGES: Record<RejectionCause, () => string> = {
		'opaque-token': m.auth_opaque_token,
		'no-audience': m.auth_audience_none,
		'no-groups': m.auth_groups_none,
		'wrong-group': m.auth_forbidden,
		'not-accepted': m.auth_rejected_401
	};
</script>

<div class="denied">
	<h1>{rejection?.reason === 'forbidden' ? m.auth_forbidden() : m.auth_rejected_title()}</h1>

	{#if cause}
		<p class="explanation" role="alert">{MESSAGES[cause]()}</p>
	{/if}

	{#if diag?.isJwt}
		<dl class="diag">
			<dt>{m.auth_diag_title()}</dt>
			<dd></dd>
			<dt>{m.auth_diag_issuer()}</dt>
			<dd>{diag.issuer ?? m.auth_diag_none()}</dd>
			<dt>{m.auth_diag_audience()}</dt>
			<dd>{diag.audience.length ? diag.audience.join(', ') : m.auth_diag_none()}</dd>
			<dt>{m.auth_diag_groups()}</dt>
			<dd>{diag.groups.length ? diag.groups.join(', ') : m.auth_diag_none()}</dd>
		</dl>
	{/if}

	<div class="actions">
		<button type="button" class="btn btn-primary" onclick={() => auth.logout()}>
			{m.auth_signout()}
		</button>
	</div>
</div>

<style>
	.denied {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		min-height: 70dvh;
		max-width: 34rem;
		margin-inline: auto;
		padding: var(--space-6) var(--space-4);
		text-align: center;
	}

	h1 {
		font-size: clamp(1.5rem, 6vw, 2rem);
		max-width: 22ch;
	}

	.explanation {
		margin: 0;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--wine-text);
		border-radius: var(--radius-md);
		color: var(--wine-text);
		text-align: start;
	}

	/* Claims only — never the token itself. */
	.diag {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-2) var(--space-4);
		width: 100%;
		margin: 0;
		padding: var(--space-4);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		text-align: start;
	}

	dt {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}

	dd {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		overflow-wrap: anywhere;
	}

	/* The first row is the caption for the rest. */
	dt:first-of-type {
		grid-column: 1 / -1;
		color: var(--ink);
		font-weight: 600;
	}

	.actions {
		display: flex;
		gap: var(--space-2);
	}
</style>
