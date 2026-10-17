import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { installFakeSettings, makeProfile } from './settings-fake.js';

const pages = [
  '/',
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

async function expectNoBlockingViolations(page: Page): Promise<void> {
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

test('settings page has no blocking axe violations: empty state', async ({ page }) => {
  await installFakeSettings(page);
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');

  await expectNoBlockingViolations(page);
});

test('settings page has no blocking axe violations: filled state', async ({ page }) => {
  await installFakeSettings(page, {
    profiles: [
      makeProfile(),
      makeProfile({
        id: 'prof_2',
        name: 'Backup',
        modelId: 'gpt-5.2-mini',
        active: false,
        hasSecret: false,
        secretRef: null,
      }),
      makeProfile({
        id: 'prof_3',
        name: 'Local voice',
        kind: 'narration',
        provider: 'browser',
        modelId: null,
        voiceId: null,
        hasSecret: false,
        secretRef: null,
        active: true,
      }),
    ],
    env: {
      authoring: { modelId: 'openai/gpt-5.2-pro' },
      narration: { voiceId: null, modelId: null, hasApiKey: false },
    },
  });
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');

  await expectNoBlockingViolations(page);
});

test('settings page has no blocking axe violations: error state', async ({ page }) => {
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
  await expect(page.locator('.profile-card').getByRole('status')).toContainText(
    'Test failed',
  );
  await page.getByRole('button', { name: 'New authoring profile' }).click();
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByText('Name is required.')).toBeVisible();
  await page.waitForLoadState('networkidle');

  await expectNoBlockingViolations(page);
});
