import { expect, test, type Page } from '@playwright/test';

/**
 * The account journey against a mocked API. Nothing here reaches GitHub; the
 * fake session endpoint flips state the same way the server would after a
 * callback, a sign-out, or a delete.
 */

interface MockState {
  signedIn: boolean;
  configured: boolean;
}

const signedOutSession = (configured: boolean) => ({
  signedIn: false,
  configured,
  sessionSecretConfigured: true,
  redirectUri: 'http://127.0.0.1:4319/api/auth/github/callback',
});

const signedInSession = {
  signedIn: true,
  configured: true,
  sessionSecretConfigured: true,
  redirectUri: 'http://127.0.0.1:4319/api/auth/github/callback',
  user: { id: 'user_1', login: 'octocat', name: 'The Octocat', avatarUrl: null },
  session: {
    id: 'session_current',
    createdAt: Date.UTC(2026, 9, 1, 10, 0),
    lastSeenAt: Date.UTC(2026, 9, 17, 9, 0),
    expiresAt: Date.UTC(2026, 10, 1, 10, 0),
    userAgent: 'Playwright Chrome',
  },
};

async function mockAccountApi(
  page: Page,
  state: MockState = { signedIn: false, configured: true },
) {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        state.signedIn ? signedInSession : signedOutSession(state.configured),
      ),
    }),
  );
  await page.route('**/api/account', async (route) => {
    if (route.request().method() === 'DELETE') {
      state.signedIn = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
      return;
    }
    if (!state.signedIn) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'sign in required' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: signedInSession.user,
        sessions: [
          {
            id: 'session_current',
            createdAt: signedInSession.session.createdAt,
            lastSeenAt: signedInSession.session.lastSeenAt,
            expiresAt: signedInSession.session.expiresAt,
            userAgent: 'Playwright Chrome',
          },
          {
            id: 'session_old',
            createdAt: Date.UTC(2026, 8, 1, 10, 0),
            lastSeenAt: Date.UTC(2026, 8, 2, 10, 0),
            expiresAt: Date.UTC(2026, 9, 1, 10, 0),
            userAgent: 'sothspell-cli',
          },
        ],
      }),
    });
  });
  await page.route('**/api/auth/signout', async (route) => {
    state.signedIn = false;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.route('**/api/sync/pull', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ runs: [], tombstones: [], serverTime: 1_700_000_000_000 }),
    }),
  );
  await page.route('**/api/sync/push', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        runs: [],
        tombstones: [],
        serverTime: 1_700_000_000_000,
        results: [],
      }),
    }),
  );
}

test('shows the signed-out account state with the GitHub sign-in link', async ({
  page,
}) => {
  await mockAccountApi(page);
  await page.goto('/account');

  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  const signIn = page.getByRole('link', { name: 'Sign in with GitHub' });
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute('href', '/api/auth/github');
  await expect(page.getByText(/read:user/)).toBeVisible();
});

test('shows setup instructions when GitHub sign-in is not configured', async ({
  page,
}) => {
  await mockAccountApi(page, { signedIn: false, configured: false });
  await page.goto('/account');

  await expect(page.getByText('GitHub sign-in is not configured.')).toBeVisible();
  await expect(
    page.getByText('http://127.0.0.1:4319/api/auth/github/callback'),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Sign in with GitHub' }),
  ).toHaveCount(0);
});

test('shows the signed-in state, syncs, and signs out', async ({ page }) => {
  await mockAccountApi(page, { signedIn: true, configured: true });
  await page.goto('/account');

  await expect(page.getByRole('heading', { name: 'The Octocat' })).toBeVisible();
  await expect(page.getByText('@octocat')).toBeVisible();
  await expect(page.getByText('Playwright Chrome')).toBeVisible();
  await expect(page.getByText('this device', { exact: true })).toBeVisible();
  await expect(page.getByText('sothspell-cli')).toBeVisible();

  await expect(page.getByRole('link', { name: 'Download account export' })).toHaveAttribute(
    'href',
    '/api/account/export',
  );

  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText('Synced: pulled 0, pushed 0, removed 0.')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByText('Signed out. Local progress stays on this device.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();
});

test('deletes the account only after the login is typed', async ({ page }) => {
  await mockAccountApi(page, { signedIn: true, configured: true });
  await page.goto('/account');

  await page.getByRole('button', { name: 'Delete account…' }).click();
  const confirmButton = page.getByRole('button', {
    name: 'Delete account and all runs',
  });
  await expect(confirmButton).toBeDisabled();

  await page.getByLabel(/Type octocat to confirm/).fill('octocat');
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();

  await expect(
    page.getByText('Your account, its sessions, and its runs were deleted.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();
});

test('shows an error state with a retry when the session endpoint fails', async ({
  page,
}) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'internal server error' }),
    }),
  );
  await page.goto('/account');

  await expect(page.getByRole('alert')).toContainText(
    'The account state did not load.',
  );
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('nudges sign-in on the home page and hides it when signed in', async ({
  page,
}) => {
  await mockAccountApi(page, { signedIn: false, configured: true });
  await page.goto('/');

  const nudge = page.getByLabel('Account').filter({ hasText: 'Keep your progress' });
  await expect(nudge.getByRole('link', { name: 'Sign in with GitHub' })).toBeVisible();

  await page.unroute('**/api/auth/session');
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(signedInSession),
    }),
  );
  await page.goto('/');
  await expect(page.getByText('Keep your progress across devices.')).toHaveCount(0);
});

test('shows the sync badge in the player topbar', async ({ page }) => {
  await mockAccountApi(page, { signedIn: true, configured: true });
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01');

  await expect(page.getByRole('link', { name: 'synced · octocat' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Two sources, one conversation' }),
  ).toBeVisible();
});
