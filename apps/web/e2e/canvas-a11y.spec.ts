import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  CANVAS_SYMBOLS,
  installCanvasSymbolTargets,
  installFakeCanvasRelations,
} from './canvas-relations-fake.js';

const PREFERENCES_KEY = 'sothspell:canvas-preferences:v1';

const BASE_PREFERENCES = {
  autoZoom: true,
  autoArrange: true,
  followBeat: true,
  motion: 'system',
  contrast: 'system',
  palette: 'default',
  textScale: 100,
  seenAutoZoom: false,
  seenAutoArrange: false,
};

async function seedPreferences(
  page: Page,
  patch: Record<string, unknown> = {},
): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: PREFERENCES_KEY, value: { ...BASE_PREFERENCES, ...patch } },
  );
}

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

function installWriteRelations(page: Page): void {
  installCanvasSymbolTargets(page, {
    anchors: { anchor_comments_create: CANVAS_SYMBOLS.service },
  });
  installFakeCanvasRelations(page);
}

async function openWriteSource(page: Page) {
  await page.goto('/t/tour_bunbun_golden/beat_write_02?view=canvas');
  await page.getByTestId('canvas-object').filter({ hasText: 'CommentsService' }).click();
  const source = page.locator('[data-container-id="anchor_comments_create"]');
  await expect(source).toBeVisible();
  // The object activation centers the source with a 280 ms transform; settle it
  // before a spec captures a "before" viewport for Undo.
  await page.waitForTimeout(400);
  return source;
}

test('moves between cards with arrows and HJKL, enters, and steps out', async ({
  page,
}) => {
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  const board = page.getByTestId('canvas-view');
  await board.focus();
  await expect(board).toBeFocused();

  const home = page.locator('[data-canvas-diagram="true"][data-home="true"]');
  const container = page.locator('[data-container-id="anchor_readme_overview"]');

  await page.keyboard.press('ArrowRight');
  await expect(container).toBeFocused();
  const focusRing = await container.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(Number.parseFloat(focusRing.width)).toBeGreaterThanOrEqual(2);
  expect(focusRing.style).not.toBe('none');

  await page.keyboard.press('h');
  await expect(home).toBeFocused();

  await page.keyboard.press('l');
  await expect(container).toBeFocused();

  // Enter on a container moves focus to its first action.
  await page.keyboard.press('Enter');
  const firstItem = container.locator('[data-canvas-item]').first();
  await expect(firstItem).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(container).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(home).toBeFocused();

  // Enter on the home diagram moves focus into its objects.
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid="canvas-object"]:focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(home).toBeFocused();
});

test('keeps Space and T on the board for the player, but Space activates an item', async ({
  page,
}) => {
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  const board = page.getByTestId('canvas-view');
  await board.focus();

  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  await page.keyboard.press('t');
  await expect(page.locator('.player-page--theater')).toHaveClass(/player-page--theater/);
  await page.keyboard.press('t');
  await expect(page.locator('.player-page--theater')).toHaveCount(0);

  const object = page.getByTestId('canvas-object').filter({ hasText: 'ATProto PDS' });
  await object.focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('canvas-code-container')).toHaveCount(1);
  // Space on the object did not also toggle playback.
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('shows the auto-arrange notice, undoes the viewport, and stays out of focus', async ({
  page,
}) => {
  installWriteRelations(page);
  const source = await openWriteSource(page);
  const before = await source.boundingBox();

  await source.getByRole('button', { name: 'Incoming', exact: true }).click();
  const notice = page.getByTestId('canvas-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Arranged the board.');
  await expect(notice.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Disable this for me' })).toBeVisible();
  // The notice is a status, not a focus target.
  await expect(
    source.getByRole('button', { name: 'Incoming', exact: true }),
  ).toBeFocused();

  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByLabel('Canvas status')).toContainText(
    'Undid the last canvas action.',
  );

  await expect
    .poll(async () => {
      const after = await source.boundingBox();
      if (!before || !after) {
        return false;
      }
      return Math.abs(after.x - before.x) <= 2 && Math.abs(after.y - before.y) <= 2;
    })
    .toBe(true);
});

test('disables auto-arrange in place and persists the preference', async ({ page }) => {
  installWriteRelations(page);
  const source = await openWriteSource(page);

  await source.getByRole('button', { name: 'Incoming', exact: true }).click();
  const notice = page.getByTestId('canvas-notice');
  await expect(notice).toHaveAttribute('data-phase', 'action');
  await notice.getByRole('button', { name: 'Disable this for me' }).click();

  await expect(notice).toHaveAttribute('data-phase', 'disabled');
  await expect(notice).toContainText('Auto-arrange is off for this browser.');
  await expect(page.getByTestId('canvas-view')).toBeFocused();

  const stored = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as { autoArrange: boolean });
  }, PREFERENCES_KEY);
  expect(stored?.autoArrange).toBe(false);

  await page.reload();
  await page.getByRole('button', { name: 'Canvas appearance' }).click();
  await expect(page.getByRole('checkbox', { name: 'Auto-arrange' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Auto-zoom' })).toBeChecked();
});

test('auto-zoom frames the source and the new container and undo restores it', async ({
  page,
}) => {
  await seedPreferences(page, { autoArrange: false });
  installWriteRelations(page);
  const source = await openWriteSource(page);
  const before = await source.boundingBox();

  await source.getByRole('button', { name: 'Incoming', exact: true }).click();
  const notice = page.getByTestId('canvas-notice');
  await expect(notice).toContainText('Zoomed to show the new code.');
  await expect(notice).toHaveAttribute('data-kind', 'autoZoom');

  // The transform frames the source and the newly opened container together.
  await page.waitForTimeout(320);
  const board = await page.locator('.canvas-board').boundingBox();
  const sourceBox = await source.boundingBox();
  const callerBox = await page
    .locator(
      `[data-testid="canvas-code-container"][data-symbol-id="${CANVAS_SYMBOLS.caller}"]`,
    )
    .boundingBox();
  expect(board).not.toBeNull();
  expect(sourceBox).not.toBeNull();
  expect(callerBox).not.toBeNull();
  for (const box of [sourceBox!, callerBox!]) {
    expect(box.x).toBeGreaterThanOrEqual(board!.x - 1);
    expect(box.y).toBeGreaterThanOrEqual(board!.y - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(board!.x + board!.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(board!.y + board!.height + 1);
  }

  await notice.getByRole('button', { name: 'Undo' }).click();
  await expect(notice).toHaveCount(0);
  await expect
    .poll(async () => {
      const after = await source.boundingBox();
      if (!before || !after) {
        return false;
      }
      return Math.abs(after.x - before.x) <= 2 && Math.abs(after.y - before.y) <= 2;
    })
    .toBe(true);
});

test('persists motion, contrast, palette, and text size across reload', async ({
  page,
}) => {
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  await page.getByRole('button', { name: 'Canvas appearance' }).click();

  await page.getByLabel('Motion').selectOption('reduce');
  await page.getByLabel('Contrast').selectOption('more');
  await page.getByLabel('Palette').selectOption('colorblind');
  await page.getByLabel('Text size').selectOption('200');

  const board = page.getByTestId('canvas-view');
  await expect(board).toHaveAttribute('data-motion', 'reduce');
  await expect(board).toHaveAttribute('data-contrast', 'more');
  await expect(board).toHaveAttribute('data-palette', 'colorblind');
  await expect(board).toHaveAttribute('data-text-scale', '200');

  await page.reload();
  const reloaded = page.getByTestId('canvas-view');
  await expect(reloaded).toHaveAttribute('data-motion', 'reduce');
  await expect(reloaded).toHaveAttribute('data-contrast', 'more');
  await expect(reloaded).toHaveAttribute('data-palette', 'colorblind');
  await expect(reloaded).toHaveAttribute('data-text-scale', '200');
});

test('renders a complete compact canvas at 375 px without page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await seedPreferences(page, { textScale: 200 });
  installWriteRelations(page);
  const source = await openWriteSource(page);

  await expect(page.getByTestId('canvas-compact')).toBeVisible();
  await expect(page.locator('.stage')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Auto-arrange', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Canvas appearance' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keyboard shortcuts' })).toBeVisible();

  await source.getByRole('button', { name: 'Incoming', exact: true }).click();
  await expect(
    page.locator(
      `[data-testid="canvas-code-container"][data-symbol-id="${CANVAS_SYMBOLS.caller}"]`,
    ),
  ).toBeVisible();
  await expect(page.getByText(/calls.*CommentsController\.create/).first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test('200% text keeps headers readable and re-measures line handles', async ({
  page,
}) => {
  await seedPreferences(page, { textScale: 200 });
  await page.goto('/t/tour_bunbun_golden/beat_request_01?view=canvas');
  await page.getByTestId('canvas-object').filter({ hasText: 'main.ts' }).click();

  const board = page.getByTestId('canvas-view');
  await expect(board).toHaveAttribute('data-text-scale', '200');
  const container = page.getByTestId('canvas-code-container');
  await expect(container).toBeVisible();

  const lineStyle = await container
    .locator('.canvas-code-excerpt .line')
    .first()
    .evaluate((element) => {
      const root = document.querySelector('.canvas-root');
      const style = getComputedStyle(element);
      return {
        lineHeight: style.lineHeight,
        height: style.height,
        scale:
          root === null
            ? null
            : getComputedStyle(root).getPropertyValue('--canvas-text-scale'),
      };
    });
  expect(lineStyle, JSON.stringify(lineStyle)).toMatchObject({
    lineHeight: '36px',
    height: '36px',
    scale: '2',
  });

  const headerClip = await container
    .locator('.canvas-code-header')
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(headerClip).toBeLessThanOrEqual(1);

  const handleTops = await container
    .locator('.canvas-line-handle')
    .evaluateAll((handles) =>
      handles
        .slice(0, 2)
        .map((handle) => Number.parseFloat(getComputedStyle(handle).top)),
    );
  expect(handleTops).toHaveLength(2);
  expect(handleTops[1]! - handleTops[0]!).toBeGreaterThanOrEqual(34);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test('forced colours keep borders, labels, and focus visible', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');

  const active = await page.evaluate(
    () => window.matchMedia('(forced-colors: active)').matches,
  );
  expect(active).toBe(true);

  const card = page.getByTestId('canvas-diagram-card').first();
  await expect(card).toBeVisible();
  const border = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    return { colour: style.borderTopColor, width: style.borderTopWidth };
  });
  expect(border.colour).not.toBe('rgba(0, 0, 0, 0)');
  expect(Number.parseFloat(border.width)).toBeGreaterThan(0);
});

test('system contrast follows prefers-contrast: more', async ({ page }) => {
  await page.emulateMedia({ contrast: 'more' });
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  const board = page.getByTestId('canvas-view');
  await expect(board).toHaveAttribute('data-contrast', 'system');

  const matched = await page.evaluate(
    () => window.matchMedia('(prefers-contrast: more)').matches,
  );
  expect(matched).toBe(true);

  await page.getByTestId('canvas-object').filter({ hasText: 'ATProto PDS' }).click();
  const textColour = await page
    .locator('.canvas-code-identity p')
    .first()
    .evaluate((element) => getComputedStyle(element).color);
  expect(textColour).toBe('rgb(51, 51, 51)');
});

test('high contrast and colour-blind palette apply readable tokens', async ({ page }) => {
  await seedPreferences(page, { contrast: 'more', palette: 'colorblind' });
  installWriteRelations(page);
  const source = await openWriteSource(page);

  const board = page.getByTestId('canvas-view');
  await expect(board).toHaveAttribute('data-contrast', 'more');
  await expect(board).toHaveAttribute('data-palette', 'colorblind');

  const textColour = await page
    .locator('[data-container-id="anchor_comments_create"] .canvas-code-identity p')
    .evaluate((element) => getComputedStyle(element).color);
  expect(textColour).toBe('rgb(51, 51, 51)');

  await source.getByRole('button', { name: 'Incoming', exact: true }).click();
  const path = page
    .locator('[data-testid="canvas-flow-edge"][data-relation-kind="calls"] path')
    .first();
  await expect(path).toBeVisible();
  const stroke = await path.evaluate((element) => getComputedStyle(element).stroke);
  expect(stroke).toBe('rgb(0, 114, 178)');
});

test('export menu and print sheet have no blocking axe violations', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await page.goto('/t/tour_bunbun_golden/beat_request_01?view=canvas');
  await page.getByTestId('canvas-object').filter({ hasText: 'main.ts' }).click();
  await expect(page.getByTestId('canvas-code-container')).toHaveCount(1);

  await page.getByTestId('canvas-export-button').click();
  await expect(page.getByTestId('canvas-export-panel')).toBeVisible();
  await expectNoBlockingViolations(page);

  await page.getByRole('button', { name: /PDF · print layout/i }).click();
  await expect(page.getByTestId('canvas-print-view')).toHaveCount(1);
  await expectNoBlockingViolations(page);

  // The screen state hides the sheet; print media is the state a reader sees
  // in the print preview, so axe checks both.
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('canvas-print-view')).toBeVisible();
  await expectNoBlockingViolations(page);
});
