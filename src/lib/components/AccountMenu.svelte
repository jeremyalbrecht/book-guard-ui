<script lang="ts">
	import { auth } from '$lib/auth.svelte';
	import { m } from '$lib/i18n';

	let open = $state(false);
	let root = $state<HTMLElement | null>(null);

	// Only rendered when a real session exists — nothing to show with auth off.
	const name = $derived(auth.profile?.name ?? auth.profile?.subject ?? '');
	const initial = $derived(name.slice(0, 1).toUpperCase() || '?');

	function onWindowPointerDown(event: PointerEvent) {
		if (open && root && !root.contains(event.target as Node)) open = false;
	}

	function onWindowKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') open = false;
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeyDown} />

<div class="account" bind:this={root}>
	<button
		type="button"
		class="avatar"
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label={m.auth_account()}
		onclick={() => (open = !open)}
	>
		{initial}
	</button>

	{#if open}
		<div class="menu" role="menu">
			<p class="who" title={name}>{name}</p>
			<button type="button" class="item" role="menuitem" onclick={() => auth.logout()}>
				{m.auth_signout()}
			</button>
		</div>
	{/if}
</div>

<style>
	.account {
		position: relative;
	}

	.avatar {
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		border: 1px solid var(--border);
		border-radius: 50%;
		background: var(--surface-2);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--ink-soft);
		cursor: pointer;
		touch-action: manipulation;
	}

	.avatar:active {
		transform: scale(0.94);
	}

	.menu {
		position: absolute;
		inset-block-start: calc(100% + var(--space-2));
		inset-inline-end: 0;
		z-index: var(--z-banner);
		min-width: 12rem;
		padding: var(--space-2);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-2);
	}

	.who {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.04em;
		color: var(--ink-soft);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item {
		display: block;
		width: 100%;
		min-height: var(--tap);
		padding: 0 var(--space-3);
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-align: start;
		color: var(--wine-text);
		cursor: pointer;
	}

	.item:hover {
		background: color-mix(in srgb, var(--ink) 6%, transparent);
	}
</style>
