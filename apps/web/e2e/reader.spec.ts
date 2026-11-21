import { test, expect } from '@playwright/test';

const firstBeat = '/t/tour_bunbun_golden/beat_purpose_01';

for (const width of [1440, 375]) {
  test(`keyboard can use and dismiss the shortcuts dialog at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(firstBeat);
    const trigger = page.getByRole('button', { name: 'Keyboard shortcuts' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const close = dialog.getByRole('button', { name: 'Close', exact: true });
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      dialog.getByRole('button', { name: /Disable this for me · Auto-zoom/i }),
    ).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(
      dialog.getByRole('button', { name: /Disable this for me · Auto-arrange/i }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

test('browser Find reaches the browser on the board and player chrome', async ({
  page,
}) => {
  await page.goto(firstBeat);
  for (const target of [
    page.getByTestId('canvas-view'),
    page.getByRole('button', { name: 'Play', exact: true }),
  ]) {
    await target.focus();
    for (const modifier of ['Control', 'Meta']) {
      await page.evaluate(() => {
        const html = document.documentElement;
        delete html.dataset.findPrevented;
        const recordFind = (event: KeyboardEvent) => {
          if (event.key.toLowerCase() !== 'f') {
            return;
          }
          window.removeEventListener('keydown', recordFind);
          queueMicrotask(() => {
            html.dataset.findPrevented = String(event.defaultPrevented);
          });
        };
        window.addEventListener('keydown', recordFind);
      });
      await page.keyboard.press(`${modifier}+f`);
      await expect(page.locator('html')).toHaveAttribute('data-find-prevented', 'false');
    }
  }
});

test('reading view keeps directed evidence, selection and source return across reload', async ({
  page,
}) => {
  await page.goto(firstBeat);
  await page.getByRole('button', { name: 'Reading view' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reading view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const reader = page.getByTestId('canvas-compact');
  await expect(
    reader
      .getByRole('listitem')
      .filter({ hasText: 'ATProto PDS writes Local index (reconcile)' }),
  ).toBeVisible();
  const object = reader.getByRole('button', { name: /Web islands/ });
  await object.click();
  await expect(object).toHaveAttribute('aria-current', 'true');
  await reader.getByRole('link', { name: 'Open code page' }).click();
  await expect(page.getByRole('heading', { name: 'What Bunbun is' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the beat' }).click();
  await expect(page).toHaveURL(/beat_purpose_01\?view=reader/);
  await expect(reader).toBeVisible();
});

test('outline describes a directed edge and selects an object without code', async ({
  page,
}) => {
  await page.goto(firstBeat);
  await page.getByRole('button', { name: 'Show outline' }).click();
  const outline = page.getByTestId('canvas-outline');
  await expect(
    outline.getByText('ATProto PDS writes Local index (reconcile)'),
  ).toBeVisible();
  const object = outline.getByRole('button', { name: 'Focus Web islands' });
  await object.click();
  await expect(object).toHaveAttribute('aria-current', 'true');
});

test('untranslated narration uses the content language', async ({ page }) => {
  await page.goto(firstBeat);
  await expect(page.locator('.narration-copy')).toHaveAttribute('lang', 'en');
  await page.getByLabel('Language').selectOption('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('.narration-copy')).toHaveAttribute('lang', 'en');
});

test('linear source pages expose numbered offscreen lines and the cited range', async ({
  page,
}) => {
  await page.route('**/api/projects/*/source/**', async (route) => {
    const lines = Array.from({ length: 252 }, (_, i) => ({
      number: i + 1,
      html: `example ${i + 1}`,
      focus: i === 171,
    }));
    await route.fulfill({
      json: {
        projectId: 'example',
        tourId: 'tour_bunbun_golden',
        anchorId: 'sample',
        path: 'sample.ts',
        label: 'Example source',
        startLine: 172,
        endLine: 172,
        language: 'ts',
        contentHash: 'hash',
        stale: false,
        totalLines: 252,
        outline: [],
        lines,
      },
    });
  });
  await page.goto(
    '/p/example/source/sample.ts?anchor=sample&tourId=tour_bunbun_golden&beat=beat_purpose_01&view=reader',
  );
  const source = page.getByRole('region', { name: 'Source lines' });
  await expect(source).toContainText('Line 172, cited');
  await page.getByRole('button', { name: 'Next lines' }).click();
  await expect(source).toContainText('Line 252');
  await page.getByRole('button', { name: 'Return to cited lines' }).click();
  await expect(source).toContainText('Line 172, cited');
  await page.getByRole('link', { name: 'Back to the beat' }).click();
  await expect(page).toHaveURL(/beat_purpose_01\?view=reader/);
});

test('skip link leads keyboard focus to main and route titles identify the task', async ({
  page,
}) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page).toHaveTitle(/Settings.*Sóþspell/);
});

test('character shortcut opt-out survives a reload and leaves controls usable', async ({
  page,
}) => {
  await page.goto(firstBeat);
  await page.getByLabel('Single-character shortcuts').uncheck();
  await page.reload();
  await expect(page.getByLabel('Single-character shortcuts')).not.toBeChecked();
  await page.getByTestId('canvas-view').focus();
  await page.keyboard.press('t');
  await expect(page.locator('.player-page--theater')).toHaveCount(0);
  await page.keyboard.press('o');
  await expect(page.getByTestId('canvas-outline')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show outline' }).click();
  await expect(page.getByTestId('canvas-outline')).toBeVisible();
});

test('outline moves a diagram and resizes a code card without dragging', async ({
  page,
}) => {
  await page.goto(firstBeat);
  await page.getByRole('button', { name: 'Show outline' }).click();
  const outline = page.getByTestId('canvas-outline');
  const card = page.getByTestId('canvas-code-container');
  const diagram = page.getByTestId('canvas-diagram-card');
  const original = await diagram.boundingBox();
  const originalCard = await card.boundingBox();
  await outline.getByText('Adjust Records, index, and readers', { exact: true }).click();
  await outline.getByLabel('Horizontal position').first().fill('180');
  await outline.getByRole('button', { name: 'Apply placement' }).first().click();
  await expect.poll(async () => (await diagram.boundingBox())?.x).not.toBe(original?.x);
  await outline.getByText('Adjust What Bunbun is', { exact: true }).click();
  await outline.getByLabel('Width').fill('800');
  await outline.getByRole('button', { name: 'Apply placement' }).last().focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await card.boundingBox())?.width ?? 0)
    .toBeGreaterThan(originalCard!.width);
});

test('reading view reflows at 320px with user text spacing and reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.goto(firstBeat + '?view=reader');
  await expect(page.getByTestId('canvas-compact')).toBeVisible();
  await page.addStyleTag({
    content:
      '* {line-height:1.5 !important; letter-spacing:.12em !important; word-spacing:.16em !important;} p {margin-bottom:2em !important;}',
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(1);
  const next = page.getByRole('button', { name: 'Next beat' });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/beat_purpose_02/);
  await expect(next).toBeFocused();
});

test('Stage sequence names sender, relation, recipient and message in reading order', async ({
  page,
}) => {
  await page.route('**/api/tours/tour_bunbun_golden?*', async (route) => {
    const response = await route.fetch();
    const tour = await response.json();
    tour.chapters[0].diagrams[0].kind = 'sequence';
    await route.fulfill({ response, json: tour });
  });
  await page.goto(firstBeat + '?view=stage');
  const diagram = page.getByTestId('sequence-diagram');
  await expect(diagram.getByRole('list', { name: 'Directed relations' })).toContainText(
    'ATProto PDS writes Local index (reconcile)',
  );
  await diagram.getByRole('button', { name: 'ATProto PDS' }).click();
  await expect(page.getByRole('heading', { name: 'What Bunbun is' })).toBeVisible();
});

test('desktop reading view scrolls its evidence without covering the transport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto(firstBeat + '?view=reader');
  const reader = page.getByTestId('canvas-view');
  await expect(page.getByTestId('canvas-compact')).toBeVisible();
  await reader.hover({ position: { x: 120, y: 200 } });
  await page.mouse.wheel(0, 1000);
  await expect
    .poll(() => reader.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Next beat' })).toBeInViewport();
});
