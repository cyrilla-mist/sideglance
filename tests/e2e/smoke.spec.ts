import { expect, test } from '@playwright/test';

test('Friday Merge decodes from Capture to result', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Sideglance/);
  await page.getByRole('button', { name: /Try an example/ }).click();
  await page.getByRole('button', { name: /Decode Context/ }).click();
  await expect(page.getByRole('heading', { name: "What's actually happening?" })).toBeVisible();
  await expect(page.locator('.snapshot')).toContainText('playful sarcasm');
  await expect(page.locator('.evidence-flow blockquote').filter({ hasText: 'fearless behavior' })).toBeVisible();
});

test('isolated phrase enters Needs Context', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: /Paste something/ }).fill('fearless behavior');
  await page.getByRole('button', { name: /Decode Context/ }).click();
  await expect(page.getByRole('heading', { name: /Need a little more context/i })).toBeVisible();
  await expect(page.getByText('What was said immediately before this?')).toBeVisible();
});
