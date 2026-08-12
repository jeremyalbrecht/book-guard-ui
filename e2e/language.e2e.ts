import { expect, test } from '@playwright/test';

test('app shell loads and the language switcher persists the chosen locale', async ({ page }) => {
	await page.goto('/');

	const switcher = page.getByRole('group', { name: /change language|changer de langue/i });
	await expect(switcher).toBeVisible();

	const english = switcher.getByRole('button', { name: 'EN' });
	await english.click();

	await expect(page.locator('html')).toHaveAttribute('lang', 'en');

	// setLocale persists to localStorage and reloads; a fresh load must keep
	// the choice instead of falling back to the base locale.
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(switcher.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
});
