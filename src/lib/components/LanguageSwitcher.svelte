<script lang="ts">
	import { getLocale, locales, setLocale, type Locale } from '$lib/paraglide/runtime';
	import { m } from '$lib/i18n';

	const LABELS: Record<string, string> = { fr: 'FR', en: 'EN' };

	// Read once: setLocale reloads the page, so this never goes stale in place.
	const current = getLocale();

	function choose(locale: Locale) {
		if (locale === current) return;
		// Persists to localStorage and reloads so every message re-renders.
		setLocale(locale);
	}
</script>

<div class="switcher" role="group" aria-label={m.language_switch()}>
	{#each locales as locale (locale)}
		<button
			type="button"
			class="lang"
			class:on={locale === current}
			aria-pressed={locale === current}
			lang={locale}
			onclick={() => choose(locale)}
		>
			{LABELS[locale] ?? locale.toUpperCase()}
		</button>
	{/each}
</div>

<style>
	.switcher {
		display: flex;
		align-items: center;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.lang {
		/* Narrower than 44px on its own, but the pair forms one 44px-tall control
		   and the two halves are 8px apart in effect — comfortable for a thumb. */
		min-width: 38px;
		min-height: var(--tap);
		padding: 0 var(--space-2);
		border: 0;
		background: none;
		color: var(--ink-soft);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.08em;
		cursor: pointer;
		touch-action: manipulation;
		transition:
			background var(--dur-fast) var(--ease-out),
			color var(--dur-fast) var(--ease-out);
	}

	.lang + .lang {
		border-inline-start: 1px solid var(--border);
	}

	.lang.on {
		background: var(--surface-2);
		color: var(--ink);
	}

	.lang:active {
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}
</style>
