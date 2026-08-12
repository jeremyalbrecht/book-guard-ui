<script lang="ts">
	import { online } from '$lib/online.svelte';
	import { m } from '$lib/i18n';
</script>

<!--
	Persistent while offline: the shelf below is the last synced copy, and every
	mutating action in the app is disabled for as long as this is showing.
	aria-live so a screen reader hears about it without losing focus.
-->
{#if !online.current}
	<div class="banner" role="status" aria-live="polite">
		<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
			<path
				d="M2 5l20 14M5.5 9.6A11 11 0 0 1 12 7.5c2.6 0 5 .9 6.9 2.4M8.6 13.4A6.4 6.4 0 0 1 12 12.3c1.3 0 2.5.4 3.5 1.1"
				stroke="currentColor"
				stroke-width="1.7"
				stroke-linecap="round"
				fill="none"
			/>
			<circle cx="12" cy="17.5" r="1.4" fill="currentColor" />
		</svg>
		<span>{m.offline_banner()}</span>
	</div>
{/if}

<style>
	.banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		background: var(--wine);
		color: var(--on-wine);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-align: center;
	}
</style>
