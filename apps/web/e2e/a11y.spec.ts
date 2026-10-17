import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const pages = [
  '/',
  '/account',
  '/t/tour_bunbun_golden/beat_purpose_01',
  '/p/bunbun/source/apps/api/src/main.ts?anchor=anchor_main_bootstrap&beat=beat_request_01',
];

for (const path of pages) {
  test(`has no critical or serious axe violations: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );

    expect(
      blocking,
      blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
    ).toEqual([]);
  });
}

test('listen and ask player states have no blocking axe violations', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      onboundary?: (event: { charIndex: number }) => void;
      onend?: () => void;
      onerror?: (event: { error: string }) => void;

      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: FakeUtterance,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (utterance: FakeUtterance) => utterance.onboundary?.({ charIndex: 0 }),
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
      },
    });
  });

  await page.goto('/t/tour_bunbun_golden/beat_purpose_01');
  await page.getByRole('button', { name: 'Listen' }).click();
  await page.getByRole('button', { name: 'Ask about this beat' }).click();
  await page.waitForLoadState('networkidle');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );

  expect(
    blocking,
    blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
});

async function expectNoBlockingViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );

  expect(
    blocking,
    blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
}

test('signed-in account state has no blocking axe violations', async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        signedIn: true,
        configured: true,
        sessionSecretConfigured: true,
        redirectUri: 'http://127.0.0.1:4319/api/auth/github/callback',
        user: { id: 'user_1', login: 'octocat', name: 'The Octocat', avatarUrl: null },
        session: {
          id: 'session_current',
          createdAt: 1_700_000_000_000,
          lastSeenAt: 1_700_000_000_000,
          expiresAt: 1_700_600_000_000,
          userAgent: 'Playwright Chrome',
        },
      }),
    }),
  );
  await page.route('**/api/account', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: { id: 'user_1', login: 'octocat', name: 'The Octocat', avatarUrl: null },
        sessions: [
          {
            id: 'session_current',
            createdAt: 1_700_000_000_000,
            lastSeenAt: 1_700_000_000_000,
            expiresAt: 1_700_600_000_000,
            userAgent: 'Playwright Chrome',
          },
        ],
      }),
    }),
  );
  await page.route('**/api/sync/pull', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ runs: [], tombstones: [], serverTime: 1_700_000_000_000 }),
    }),
  );

  await page.goto('/account');
  await page.waitForLoadState('networkidle');

  await expectNoBlockingViolations(page);
});

test('account error state has no blocking axe violations', async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'internal server error' }),
    }),
  );

  await page.goto('/account');
  await page.waitForLoadState('networkidle');

  await expectNoBlockingViolations(page);
});
