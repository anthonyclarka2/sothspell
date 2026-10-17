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
  await expect(page.getByTestId('code-viewport')).toBeVisible();

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
  await expect(page.getByTestId('code-viewport')).toBeVisible();
});

test('renders a full file with the focused line mounted', async ({ page }) => {
  await page.goto(
    '/p/bunbun/source/apps/api/src/main.ts?anchor=anchor_main_bootstrap&beat=beat_request_01',
  );

  await expect(page.getByRole('heading', { name: 'bootstrap()' })).toBeVisible();
  await expect(page.getByTestId('code-viewport')).toBeVisible();
  await expect(page.locator('.code-line[data-line="37"]')).toHaveClass(
    /code-line--focus/,
  );
  await expect(page.getByText('Anchors', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Matches the pinned snapshot|Source changed since this tour/),
  ).toBeVisible();
});

test('supports the keyboard-only playback journey', async ({ page }) => {
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01');
  await expect(
    page.getByRole('heading', { name: 'Two sources, one conversation' }),
  ).toBeVisible();

  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('heading', { name: 'Three application surfaces' }),
  ).toBeVisible();

  await page.keyboard.press('t');
  await expect(page.locator('.chapter-rail')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.chapter-rail')).toBeVisible();
});

test('scrubs across a beat boundary', async ({ page }) => {
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01');
  const slider = page.locator('input[type="range"]');
  await slider.evaluate((element) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(input, '60');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await expect(
    page.getByRole('heading', { name: 'Three application surfaces' }),
  ).toBeVisible();
});

test('narrates with browser speech and pauses', async ({ page }) => {
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
        speak: (utterance: FakeUtterance) => {
          utterance.onboundary?.({ charIndex: 0 });
        },
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
      },
    });
  });

  await page.goto('/t/tour_bunbun_golden/beat_purpose_01');
  await page.getByRole('button', { name: 'Listen' }).click();
  await expect(page.getByText(/Listening · browser voice/)).toBeVisible();
  await expect(page.locator('.narration-sentence.is-active')).toBeVisible();

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Narration paused')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

test('asks a question, opens a cited anchor, and continues', async ({ page }) => {
  await page.route('**/api/tours/*/ask', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        answer: {
          markdown: 'The PDS is the source of truth. The local index is a read model.',
          citations: ['anchor_readme_overview'],
          followUps: ['Why is the index separate?'],
        },
        citations: [
          {
            id: 'anchor_readme_overview',
            label: 'What Bunbun is',
            path: 'README.md',
            startLine: 3,
            endLine: 3,
          },
        ],
        warnings: [],
        modelId: 'fake/model',
      }),
    });
  });

  await page.goto('/t/tour_bunbun_golden/beat_purpose_01');
  await page.getByRole('button', { name: 'Ask about this beat' }).click();
  await page.getByLabel('Your question').fill('What is the source of truth?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();

  await expect(
    page.getByText('The PDS is the source of truth.'),
  ).toBeVisible();
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: 'What Bunbun is' }).click(),
  ]);
  await expect(
    popup.getByRole('heading', { name: 'What Bunbun is' }),
  ).toBeVisible();
  await popup.close();
  await page.getByRole('button', { name: 'Continue tour' }).click();
  await expect(
    page.getByRole('heading', { name: 'Two sources, one conversation' }),
  ).toBeVisible();
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

test('does not overflow at mobile and tablet widths', async ({ page }) => {
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/t/tour_bunbun_golden/beat_purpose_01');
    await expect(
      page.getByRole('heading', { name: 'Two sources, one conversation' }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});
