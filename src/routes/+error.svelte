<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { m } from '$lib/i18n';
</script>

<svelte:head><title>{page.status} — Ex-Libris</title></svelte:head>

<div class="page">
	<p class="eyebrow">{m.error_code({ status: page.status })}</p>
	<h1>{page.error?.message ?? m.error_unexpected()}</h1>
	<a class="btn btn-primary" href={resolve('/')}>{m.error_back_home()}</a>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-4);
		max-width: 46rem;
		margin-inline: auto;
		padding: var(--space-7) var(--space-4) 0;
	}

	h1 {
		font-size: clamp(1.5rem, 6vw, 2rem);
		max-width: 20ch;
	}
</style>
