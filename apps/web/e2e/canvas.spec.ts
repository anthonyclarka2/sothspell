import { expect, test } from '@playwright/test';

test('opens the canvas, follows evidence, and returns to the stage with the beat', async ({
  page,
}) => {
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');

  await expect(page.getByTestId('canvas-view')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Two sources, one conversation' }),
  ).toBeVisible();
  const home = page.getByTestId('canvas-diagram-card').filter({
    hasText: 'Records, index, and readers',
  });
  await expect(home).toBeVisible();

  // The view is a search parameter: a reload keeps the canvas and the beat.
  await page.reload();
  await expect(page.getByTestId('canvas-view')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Two sources, one conversation' }),
  ).toBeVisible();

  const pds = page.getByTestId('canvas-object').filter({ hasText: 'ATProto PDS' });
  await pds.focus();
  await page.keyboard.press('Enter');

  const container = page.getByTestId('canvas-code-container');
  await expect(container).toHaveCount(1);
  await expect(container).toContainText('What Bunbun is');
  await expect(container).toContainText('README.md');
  await expect(page.getByTestId('canvas-evidence-edge').first()).toBeVisible();
  // Activation does not steal focus from the object that was activated.
  await expect(pds).toBeFocused();

  // Opening the same object again focuses the existing container.
  await pds.click();
  await expect(page.getByTestId('canvas-code-container')).toHaveCount(1);

  // Start playback, switch to Stage, and keep both the beat and the transport.
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Stage', exact: true }).click();

  await expect(page.getByTestId('canvas-view')).toBeHidden();
  await expect(page.locator('.stage')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Two sources, one conversation' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(page).not.toHaveURL(/view=canvas/);
});

test('adds a second chapter diagram from the tray', async ({ page }) => {
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  await page.getByRole('button', { name: 'Add Repository map' }).click();

  await expect(page.getByTestId('canvas-diagram-card')).toHaveCount(2);
  await expect(
    page.getByTestId('canvas-diagram-card').filter({ hasText: 'Repository map' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Focus Repository map' })).toBeVisible();
  await expect(page.getByTestId('canvas-evidence-edge')).not.toHaveCount(0);
});

test('keeps the Stage and explains the compact canvas below 768 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');

  await expect(page.getByTestId('canvas-view')).toBeHidden();
  await expect(page.locator('.stage')).toBeVisible();
  await expect(page.getByText(/compact canvas arrives in Phase 19/i)).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByText(/compact canvas arrives in Phase 19/i)).toBeHidden();
});

test('opens the anchored code page from a canvas container', async ({ page }) => {
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  await page.getByTestId('canvas-code-container').waitFor();

  await page.getByRole('link', { name: 'Open code page' }).click();
  await expect(page.getByRole('heading', { name: 'What Bunbun is' })).toBeVisible();
  await expect(page.getByTestId('code-viewport')).toBeVisible();

  await page.getByRole('link', { name: /back to the beat/i }).click();
  await expect(
    page.getByRole('heading', { name: 'Two sources, one conversation' }),
  ).toBeVisible();
});

test('keeps collapsed lines out of the DOM until expanded', async ({ page }) => {
  await page.goto('/t/tour_bunbun_golden/beat_request_01?view=canvas');
  await page.getByTestId('canvas-object').filter({ hasText: 'main.ts' }).click();

  const container = page.getByTestId('canvas-code-container');
  await expect(container).toBeVisible();
  await expect(container.locator('[data-line="25"]')).toHaveCount(0);

  await container.getByRole('button', { name: /show all 31 lines/i }).click();
  await expect(container.locator('[data-line="25"]')).toHaveCount(1);
});

test('pulses and hints after fullscreen, then returns with Escape and F', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let active: Element | null = null;
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => active,
    });
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value: async () => {
        active = document.querySelector('.canvas-root');
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: async () => {
        active = null;
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    });
  });

  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  const enter = page.getByRole('button', { name: 'Enter fullscreen' });
  await enter.click();

  await expect(page.getByText('Press F or Esc to return')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toHaveClass(
    /canvas-control--pulse/,
  );

  await page.keyboard.press('Escape');
  await expect(page.getByText('Press F or Esc to return')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible();

  await page.keyboard.press('f');
  await expect(page.getByText('Press F or Esc to return')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByText('Press F or Esc to return')).toBeHidden();
});

test('keeps two diagrams apart at desktop and tablet widths', async ({ page }) => {
  for (const { width, height } of [
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
    await page.getByRole('button', { name: 'Add Repository map' }).click();
    await expect(page.getByTestId('canvas-diagram-card')).toHaveCount(2);

    const boxes = await page.getByTestId('canvas-diagram-card').evaluateAll((cards) =>
      cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }),
    );
    expect(boxes).toHaveLength(2);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlaps =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height;
        expect(overlaps, `cards overlap at ${width}px`).toBe(false);
      }
    }
  }
});
