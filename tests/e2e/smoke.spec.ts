import { expect, test } from '@playwright/test';

test('formal Sideglance scaffold loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Sideglance/);
  await expect(page.getByRole('heading', { name: /Understand more than the words/i })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('no AI');
});
