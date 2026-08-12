<script lang="ts">
	import { browser } from '$app/environment';
	import { m } from '$lib/i18n';

	type Theme = 'light' | 'dark';

	const STORAGE_KEY = 'exlibris:theme';

	// app.html has already resolved and applied the theme before first paint;
	// read it back rather than deciding a second time.
	let theme = $state<Theme>(
		browser && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
	);

	function toggle() {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = theme;
		// An explicit choice outranks the system preference from here on.
		localStorage.setItem(STORAGE_KEY, theme);
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', theme === 'dark' ? '#1B1815' : '#EFF0E9');
	}
</script>

<button
	type="button"
	class="toggle"
	onclick={toggle}
	aria-pressed={theme === 'dark'}
	aria-label={theme === 'dark' ? m.theme_to_light() : m.theme_to_dark()}
>
	{#if theme === 'dark'}
		<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
			<circle cx="12" cy="12" r="4.2" fill="currentColor" />
			<g stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
				<path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2" />
				<path d="M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
			</g>
		</svg>
	{:else}
		<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
			<path
				d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"
				fill="currentColor"
			/>
		</svg>
	{/if}
</button>

<style>
	.toggle {
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
		touch-action: manipulation;
		transition:
			color var(--dur-fast) var(--ease-out),
			border-color var(--dur-fast) var(--ease-out);
	}

	.toggle:hover {
		color: var(--ink);
		border-color: var(--border);
	}

	.toggle:active {
		transform: scale(0.94);
	}
</style>
