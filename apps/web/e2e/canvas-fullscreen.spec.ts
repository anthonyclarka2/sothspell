import { expect, test, type Page } from '@playwright/test';

const PLAYER = '/t/tour_bunbun_golden/beat_purpose_01?view=canvas';

/**
 * A fake Fullscreen API that records the element actually requested. The
 * player targets `.player-page`; recording `this` is the only way a mock can
 * prove that, and the class mirror keeps the layout testable without a real
 * fullscreen transition.
 */
async function installFullscreenMock(page: Page) {
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
      value: async function (this: Element) {
        // oxlint-disable-next-line typescript/no-this-alias -- the fake API must record the requested element.
        active = this;
        window.dispatchEvent(new Event('resize'));
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: async () => {
        active = null;
        window.dispatchEvent(new Event('resize'));
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    });
  });
}

async function expectFullscreenPage(page: Page) {
  await expect(page.locator('.player-page')).toHaveClass(/player-page--fullscreen/);
  expect(
    await page.evaluate(
      () => document.fullscreenElement?.classList.contains('player-page') ?? false,
    ),
  ).toBe(true);
}

async function expectWindowedPage(page: Page) {
  await expect(page.locator('.player-page')).not.toHaveClass(/player-page--fullscreen/);
  expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
}

async function enterFullscreen(page: Page) {
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expectFullscreenPage(page);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectCardsInsideBoard(page: Page) {
  const board = page.getByTestId('canvas-view');
  await expect(board).toBeVisible();
  await expect
    .poll(async () => {
      const box = await board.boundingBox();
      const cards = await page.getByTestId('canvas-diagram-card').evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          };
        }),
      );
      if (!box || cards.length === 0) {
        return false;
      }
      return cards.every(
        (card) =>
          card.left >= box.x - 1 &&
          card.right <= box.x + box.width + 1 &&
          card.top >= box.y - 1 &&
          card.bottom <= box.y + box.height + 1,
      );
    })
    .toBe(true);
}

test('targets the player page and keeps the chrome at 1440 and 1024 px', async ({
  page,
}) => {
  await installFullscreenMock(page);

  for (const { width, height } of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(PLAYER);
    await enterFullscreen(page);

    // The requested element is the whole player surface, not the canvas.
    expect(
      await page.evaluate(() => document.fullscreenElement?.className ?? ''),
    ).toContain('player-page');

    await expect(page.getByRole('button', { name: 'Stage', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Canvas', exact: true })).toBeVisible();
    if (width >= 1081) {
      await expect(
        page.locator('.chapter-rail:not(.chapter-rail--drawer)'),
      ).toBeVisible();
    } else {
      await expect(page.locator('.chapter-rail:not(.chapter-rail--drawer)')).toBeHidden();
      await expect(
        page.getByRole('button', { name: 'Chapters', exact: true }),
      ).toBeVisible();
    }
    await expect(page.locator('.narration')).toBeVisible();
    await expect(page.locator('.transport')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press('Escape');
    await expectWindowedPage(page);
  }
});

test('re-fits the canvas on fullscreen entry and exit', async ({ page }) => {
  await installFullscreenMock(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PLAYER);
  await page.getByRole('button', { name: 'Add Repository map' }).click();
  await expect(page.getByTestId('canvas-diagram-card')).toHaveCount(2);

  await enterFullscreen(page);
  await expectCardsInsideBoard(page);

  // Pan the board away so only a fit can bring the cards back into view.
  const box = await page.getByTestId('canvas-view').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 700, box!.y + box!.height / 2 + 400, {
    steps: 10,
  });
  await page.mouse.up();

  const viewport = page.locator('.react-flow__viewport');
  const panned = await viewport.getAttribute('style');
  expect(panned).not.toBeNull();

  await page.keyboard.press('Escape');
  await expectWindowedPage(page);

  // Exit re-fits against the windowed measurements; the panned transform is
  // replaced and every card is back inside the board.
  await expect.poll(() => viewport.getAttribute('style')).not.toBe(panned);
  await expectCardsInsideBoard(page);
});

test('exits fullscreen with F and Escape from player chrome', async ({ page }) => {
  await installFullscreenMock(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(PLAYER);
  await enterFullscreen(page);

  const trigger = page.getByRole('button', { name: 'Chapters', exact: true });
  await trigger.focus();
  await page.keyboard.press('f');
  await expectWindowedPage(page);

  await trigger.focus();
  await page.keyboard.press('f');
  await expectFullscreenPage(page);

  await trigger.focus();
  await page.keyboard.press('Escape');
  await expectWindowedPage(page);
});

test('toggles fullscreen in the compact canvas at 375 px', async ({ page }) => {
  await installFullscreenMock(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(PLAYER);
  await enterFullscreen(page);
  await expect(page.getByTestId('canvas-compact')).toBeVisible();

  await page.getByRole('button', { name: 'Exit fullscreen' }).focus();
  await page.keyboard.press('f');
  await expectWindowedPage(page);

  // Focus stayed on the compact toolbar control; the page-level fallback must
  // keep working even though the canvas root has no key handler here.
  await page.keyboard.press('f');
  await expectFullscreenPage(page);

  await page.keyboard.press('Escape');
  await expectWindowedPage(page);
});

test('scrolls the compact canvas instead of clipping cards at 375 px', async ({
  page,
}) => {
  await installFullscreenMock(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(PLAYER);
  await enterFullscreen(page);

  const root = page.getByTestId('canvas-view');
  const metrics = await root.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(metrics.overflowY).toBe('auto');
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  const cards = page.getByTestId('canvas-diagram-card');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const card = await cards.nth(index).boundingBox();
    expect(card).not.toBeNull();
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width).toBeLessThanOrEqual(375.5);
  }

  const last = cards.last();
  await last.scrollIntoViewIfNeeded();
  const lastBox = await last.boundingBox();
  expect(lastBox).not.toBeNull();
  expect(lastBox!.y).toBeGreaterThanOrEqual(0);
  expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(900);

  await expectNoHorizontalOverflow(page);
});

test('closes the shortcut sheet before leaving fullscreen', async ({ page }) => {
  await installFullscreenMock(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PLAYER);
  await enterFullscreen(page);

  await page.getByTestId('canvas-view').focus();
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expectFullscreenPage(page);

  await page.keyboard.press('Escape');
  await expectWindowedPage(page);
});

test('steps out of canvas items and containers before leaving fullscreen', async ({
  page,
}) => {
  await installFullscreenMock(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PLAYER);
  await enterFullscreen(page);

  await page.getByTestId('canvas-object').filter({ hasText: 'ATProto PDS' }).click();
  const container = page.locator('[data-container-id="anchor_readme_overview"]');
  await expect(container).toBeVisible();

  await container.locator('[data-canvas-item="close"]').focus();
  await page.keyboard.press('Escape');
  await expect(container).toBeFocused();
  await expectFullscreenPage(page);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-canvas-diagram="true"]').first()).toBeFocused();
  await expectFullscreenPage(page);

  await page.keyboard.press('Escape');
  await expectWindowedPage(page);
});

test('leaves fullscreen when the viewer switches to Stage', async ({ page }) => {
  await installFullscreenMock(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PLAYER);
  await enterFullscreen(page);

  await page.getByRole('button', { name: 'Stage', exact: true }).click();

  await expectWindowedPage(page);
  await expect(page.locator('.stage')).toBeVisible();
  await expect(page).toHaveURL(/view=stage/);
});

test('clears theater when fullscreen starts', async ({ page }) => {
  await installFullscreenMock(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PLAYER);

  await page.getByRole('button', { name: 'Enter theater mode' }).click();
  await expect(page.locator('.player-page')).toHaveClass(/player-page--theater/);
  await expect(page.locator('.chapter-rail:not(.chapter-rail--drawer)')).toBeHidden();

  await enterFullscreen(page);

  await expect(page.locator('.player-page')).not.toHaveClass(/player-page--theater/);
  await expect(page.locator('.player-viewbar')).toBeVisible();
  await expect(page.locator('.chapter-rail:not(.chapter-rail--drawer)')).toBeVisible();
  await expect(page.locator('.narration')).toBeVisible();
  await expect(page.locator('.transport')).toBeVisible();
});

test('keeps canvas, narration, and Ask from colliding at 1024x768', async ({ page }) => {
  await installFullscreenMock(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(PLAYER);
  await enterFullscreen(page);

  await page.getByRole('button', { name: 'Ask about this beat' }).click();
  await expect(page.locator('.ask-panel')).toBeVisible();
  await expect(page.locator('.canvas-relation-legend')).toBeHidden();

  const canvas = await page.getByTestId('canvas-view').boundingBox();
  const narration = await page.locator('.narration').boundingBox();
  const ask = await page.locator('.ask-panel').boundingBox();
  const transport = await page.locator('.transport').boundingBox();
  expect(canvas).not.toBeNull();
  expect(narration).not.toBeNull();
  expect(ask).not.toBeNull();
  expect(transport).not.toBeNull();

  expect(canvas!.height, 'canvas keeps a usable height').toBeGreaterThan(180);
  expect(narration!.height, 'narration is capped').toBeLessThanOrEqual(111);
  expect(ask!.height, 'ask panel is capped').toBeLessThanOrEqual(216);
  expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(narration!.y + 1);
  expect(narration!.y + narration!.height).toBeLessThanOrEqual(ask!.y + 1);
  expect(ask!.y + ask!.height).toBeLessThanOrEqual(transport!.y + 1);
  expect(transport!.y + transport!.height).toBeLessThanOrEqual(768.5);

  await expectNoHorizontalOverflow(page);
});

test('has no horizontal overflow in fullscreen at every supported width', async ({
  page,
}) => {
  await installFullscreenMock(page);

  for (const { width, height } of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 900 },
    { width: 375, height: 900 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(PLAYER);
    await enterFullscreen(page);
    await expectNoHorizontalOverflow(page);

    const pageBox = await page.locator('.player-page').boundingBox();
    expect(pageBox).not.toBeNull();
    expect(pageBox!.x).toBeGreaterThanOrEqual(-1);
    expect(pageBox!.x + pageBox!.width).toBeLessThanOrEqual(width + 1);
  }
});
