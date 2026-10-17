import { expect, test } from '@playwright/test';
import { installTranslatedTours } from './locale-fake.js';

const PLAYER = '/t/tour_bunbun_golden/beat_purpose_01';

test('switching to Spanish localizes the shell and captions without leaving the beat', async ({
  page,
}) => {
  const { requests } = installTranslatedTours(page);
  await page.goto(PLAYER);

  await expect(page.locator('.narration-copy')).not.toContainText('«es»');

  await page.getByLabel('Language').selectOption('es');

  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('.narration-copy')).toContainText('«es»');
  await expect(page.locator('.narration-copy')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('link', { name: 'Ajustes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Escuchar' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Pregunta sobre este beat' }),
  ).toBeVisible();

  // The locale switch must not reset the beat.
  await expect(page).toHaveURL(/beat_purpose_01/);
  expect(requests.some((url) => url.includes('locale=es'))).toBe(true);
});

test('switching locale while listening keeps the beat and restarts in the new locale', async ({
  page,
}) => {
  installTranslatedTours(page);
  await page.goto(PLAYER);

  await page.getByRole('button', { name: 'Listen' }).click();
  const before = await page.locator('.narration-copy').innerText();

  await page.getByLabel('Language').selectOption('es');

  await expect(page.locator('.narration-copy')).toContainText('«es»');
  await expect(page.locator('.narration-copy')).not.toHaveText(before);
  await expect(page).toHaveURL(/beat_purpose_01/);
});

test('Arabic switches the shell to RTL and keeps a keyboard-only path', async ({
  page,
}) => {
  installTranslatedTours(page);
  await page.goto(PLAYER);

  await page.getByLabel('Language').selectOption('ar');

  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.narration-copy')).toContainText('«ar»');
  await expect(page.locator('.narration-copy')).toHaveAttribute('lang', 'ar');

  // Keyboard path: activate listen mode, then Tab to the voice select.
  await page.getByRole('button', { name: 'استمع' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'وضع القراءة' })).toBeVisible();

  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? '',
    label: document.activeElement?.getAttribute('aria-label'),
  }));
  expect(focused.tag).toBe('SELECT');
  expect(focused.label).toBe('صوت السرد');
});

test('the locale choice survives a reload', async ({ page }) => {
  installTranslatedTours(page);
  await page.goto(PLAYER);

  await page.getByLabel('Language').selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.narration-copy')).toContainText('«ar»');
});
