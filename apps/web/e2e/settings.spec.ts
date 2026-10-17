import { expect, test } from '@playwright/test';
import { installFakeSettings, makeProfile } from './settings-fake.js';

test('creates, tests, activates, edits, and deletes an authoring profile', async ({
  page,
}) => {
  await installFakeSettings(page);
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Authoring' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Narration' })).toBeVisible();
  await expect(page.getByText('No authoring profiles yet.')).toBeVisible();

  // Create the first authoring profile; it becomes active automatically.
  await page.getByRole('button', { name: 'New authoring profile' }).click();
  await page.getByLabel('Name').fill('Team key');
  await page.getByLabel('Model id').fill('gpt-5.2');
  await page.getByLabel('API key').fill('sk-test-key');
  await page.getByRole('button', { name: 'Create profile' }).click();

  const card = (name: string) => page.locator('.profile-card').filter({ hasText: name });
  await expect(card('Team key').getByRole('heading', { name: 'Team key' })).toBeVisible();
  await expect(card('Team key').getByText('Active', { exact: true })).toBeVisible();
  await expect(card('Team key').getByText('API key stored')).toBeVisible();

  // Test through the fake provider.
  await page.getByRole('button', { name: 'Test Team key' }).click();
  await expect(card('Team key').getByRole('status')).toContainText(
    'Connection ok · 42 ms',
  );

  // A second profile starts inactive; activate it.
  await page.getByRole('button', { name: 'New authoring profile' }).click();
  await page.getByLabel('Name').fill('Backup');
  await page.getByLabel('Model id').fill('gpt-5.2-mini');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(card('Backup').getByText('Active', { exact: true })).toBeHidden();

  await page.getByRole('button', { name: 'Activate Backup' }).click();
  await expect(card('Backup').getByText('Active', { exact: true })).toBeVisible();
  await expect(card('Team key').getByText('Active', { exact: true })).toBeHidden();

  // Edit the active profile.
  await page.getByRole('button', { name: 'Edit Backup' }).click();
  await page.getByLabel('Model id').fill('gpt-5.2-nano');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(card('Backup').getByText('model gpt-5.2-nano')).toBeVisible();

  // Delete it, confirming the dialog.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Backup' }).click();
  await expect(card('Backup').getByRole('heading', { name: 'Backup' })).toBeHidden();
  await expect(card('Team key').getByRole('heading', { name: 'Team key' })).toBeVisible();
});

test('creates a browser-speech narration profile without an API key', async ({
  page,
}) => {
  await installFakeSettings(page);
  await page.goto('/settings');

  await page.getByRole('button', { name: 'New narration profile' }).click();
  await page.getByLabel('Name').fill('Local voice');
  await page.getByLabel('Provider').selectOption('browser');
  await expect(page.getByLabel('API key')).toBeHidden();
  await page.getByRole('button', { name: 'Create profile' }).click();

  const card = page.locator('.profile-card').filter({ hasText: 'Local voice' });
  await expect(card.getByRole('heading', { name: 'Local voice' })).toBeVisible();
  await expect(card.getByText('No API key stored')).toBeVisible();
  await expect(
    card.locator('.profile-badge', { hasText: 'Browser speech (local)' }),
  ).toBeVisible();
});

test('shows inline validation before any request is made', async ({ page }) => {
  const state = await installFakeSettings(page);
  await page.goto('/settings');

  await page.getByRole('button', { name: 'New authoring profile' }).click();
  await page.getByRole('button', { name: 'Create profile' }).click();

  await expect(page.getByText('Name is required.')).toBeVisible();
  await expect(page.getByText(/Model id is required for authoring/)).toBeVisible();
  await expect(page.getByLabel('Name')).toBeFocused();
  expect(state.requests.filter((request) => request.method === 'POST')).toEqual([]);

  await page.getByLabel('Provider').selectOption('openai-compatible');
  await page.getByLabel('Name').fill('Local endpoint');
  await page.getByLabel('Model id').fill('local-model');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(
    page.getByText('Base URL is required for an OpenAI-compatible endpoint.'),
  ).toBeVisible();
});

test('shows a duplicate-name error from the server', async ({ page }) => {
  await installFakeSettings(page, { profiles: [makeProfile()] });
  await page.goto('/settings');

  await page.getByRole('button', { name: 'New authoring profile' }).click();
  await page.getByLabel('Name').fill('team key');
  await page.getByLabel('Model id').fill('gpt-5.2');
  await page.getByRole('button', { name: 'Create profile' }).click();

  await expect(page.getByRole('alert')).toContainText('already exists');
});

test('shows a redacted provider failure in the status region', async ({ page }) => {
  await installFakeSettings(page, {
    profiles: [makeProfile()],
    testStatus: 502,
    testBody: {
      ok: false,
      error: 'provider test failed: 401 Unauthorized [redacted]',
      latencyMs: 5,
    },
  });
  await page.goto('/settings');

  await page.getByRole('button', { name: 'Test Team key' }).click();

  const status = page.locator('.profile-card').getByRole('status');
  await expect(status).toContainText('Test failed');
  await expect(status).toContainText('[redacted]');
  await expect(status).not.toContainText('sk-');
});

test('marks environment-overridden fields read-only', async ({ page }) => {
  await installFakeSettings(page, {
    profiles: [makeProfile()],
    env: {
      authoring: { modelId: 'openai/gpt-5.2-pro' },
      narration: { voiceId: null, modelId: null, hasApiKey: false },
    },
  });
  await page.goto('/settings');

  await expect(page.getByText(/SOTHSPELL_MODEL is set on the server/)).toBeVisible();
  await page.getByRole('button', { name: 'Edit Team key' }).click();
  await expect(page.getByLabel('Model id')).toHaveAttribute('readonly', '');
  await expect(page.getByText(/Overridden by SOTHSPELL_MODEL/)).toBeVisible();
});

test('supports a keyboard-only create and test path', async ({ page }) => {
  await installFakeSettings(page);
  await page.goto('/settings');

  await page.getByRole('button', { name: 'New authoring profile' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Create profile' })).toBeVisible();

  await page.getByLabel('Name').focus();
  await page.keyboard.type('Keyboard key');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Provider')).toBeFocused();

  await page.getByLabel('Model id').focus();
  await page.keyboard.type('gpt-5.2');
  await page.getByRole('button', { name: 'Create profile' }).focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Keyboard key' })).toBeVisible();
  await page.getByRole('button', { name: 'Test Keyboard key' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Connection ok');
});
