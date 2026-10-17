import { expect, test } from '@playwright/test';

test('plays the golden tour and opens code from a beat', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Bunbun: a truth story' }),
  ).toBeVisible();

  await page.getByRole('link', { name: /play the tour/i }).click();
  await expect(
    page.getByRole('heading', { name: 'Two sources, one conversation' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

  await page.getByRole('button', { name: 'Next beat' }).click();
  await expect(
    page.getByRole('heading', { name: 'Three application surfaces' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Open code page' }).click();
  await expect(page.getByRole('heading', { name: 'Repository layout' })).toBeVisible();
  await expect(page.locator('.code-card .shiki')).toBeVisible();

  await page.getByRole('link', { name: /back to the beat/i }).click();
  await expect(
    page.getByRole('heading', { name: 'Three application surfaces' }),
  ).toBeVisible();
});

test('opens code from a diagram node', async ({ page }) => {
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01');
  await expect(
    page.getByRole('heading', { name: 'Two sources, one conversation' }),
  ).toBeVisible();

  await page.locator('.diagram-node', { hasText: 'ATProto PDS' }).click();
  await expect(page.getByRole('heading', { name: 'What Bunbun is' })).toBeVisible();
  await expect(page.locator('.code-card .shiki')).toBeVisible();
});

test('remembers a paused position across a reload', async ({ page }) => {
  await page.goto('/t/tour_bunbun_golden/beat_purpose_02');
  await expect(
    page.getByRole('heading', { name: 'Three application surfaces' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Pause' }).click();

  await page.reload();
  await expect(page.getByText(/you have progress in this tour/i)).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(
    page.getByRole('heading', { name: 'Three application surfaces' }),
  ).toBeVisible();
});
