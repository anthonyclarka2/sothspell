import { expect, test } from '@playwright/test';

const BEAT = '/t/tour_bunbun_golden/beat_purpose_01?view=canvas';
const PDS_CONTAINER = '[data-container-id="anchor_readme_overview"]';

test.beforeEach(async ({ page }) => {
  await page.goto(BEAT);
  await expect(page.getByTestId('canvas-view')).toBeVisible();
});

test('resizes a selected code container and keeps the header draggable', async ({
  page,
}) => {
  const container = page.locator(PDS_CONTAINER);
  await container.click();

  await expect(container.locator('.canvas-code-header')).toHaveClass(
    /canvas-drag-handle/,
  );
  const handle = container.locator('.canvas-resize-handle').last();
  await expect(handle).toBeVisible();

  const before = await container.boundingBox();
  expect(before).not.toBeNull();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 140, box!.y + 100, { steps: 8 });
  await page.mouse.up();

  const after = await container.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.width).toBeGreaterThan(before!.width + 80);
  expect(after!.height).toBeGreaterThan(before!.height + 50);
});

test('closes a container and reopens it from its diagram object', async ({ page }) => {
  const object = page.getByTestId('canvas-object').filter({ hasText: 'ATProto PDS' });
  await object.click();
  await expect(page.locator(PDS_CONTAINER)).toBeVisible();

  await page.getByRole('button', { name: /Close What Bunbun is/i }).click();
  await expect(page.locator(PDS_CONTAINER)).toBeHidden();

  await object.click();
  await expect(page.locator(PDS_CONTAINER)).toBeVisible();
});

test('moves a container by its header', async ({ page }) => {
  const container = page.locator(PDS_CONTAINER);
  await container.click();
  const header = container.locator('.canvas-code-header');
  const before = await container.boundingBox();
  const box = await header.boundingBox();
  expect(before).not.toBeNull();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + 60, box!.y + 20);
  await page.mouse.down();
  await page.mouse.move(box!.x + 180, box!.y + 100, { steps: 8 });
  await page.mouse.up();

  const after = await container.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.x - before!.x)).toBeGreaterThan(80);
  expect(Math.abs(after!.y - before!.y)).toBeGreaterThan(40);
});

test('renders code lines without blank-line gaps', async ({ page }) => {
  await page.goto('/t/tour_bunbun_golden/beat_request_01?view=canvas');
  await page.getByTestId('canvas-object').filter({ hasText: 'main.ts' }).click();
  const lines = page.locator(
    PDS_CONTAINER.replace('anchor_readme_overview', 'anchor_main_bootstrap'),
  );
  await expect(lines).toBeVisible();

  const offsets = await lines
    .locator('.canvas-code-excerpt .shiki .line')
    .evaluateAll((elements) =>
      elements.slice(0, 4).map((element) => {
        const line = element as HTMLElement;
        return { top: line.offsetTop, height: line.offsetHeight };
      }),
    );
  expect(offsets).toHaveLength(4);
  for (let index = 1; index < offsets.length; index += 1) {
    const previous = offsets[index - 1]!;
    const current = offsets[index]!;
    expect(current.top - previous.top).toBe(previous.height);
  }
});

test('highlights edges for the selected container', async ({ page }) => {
  const object = page.getByTestId('canvas-object').filter({ hasText: 'ATProto PDS' });
  await object.click();
  const container = page.locator(PDS_CONTAINER);
  await container.click();

  await expect(page.getByTestId('canvas-evidence-edge').first()).toHaveAttribute(
    'data-selected',
    'true',
  );
  await expect(
    page.getByTestId('canvas-evidence-edge').first().locator('path').first(),
  ).toHaveCSS('stroke-width', '3px');
});

test('selects a diagram object even when it has no code target', async ({ page }) => {
  const object = page.getByTestId('canvas-object').filter({ hasText: 'Web islands' });
  await object.click();
  await expect(object).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('canvas-code-container')).toHaveCount(1);
});

test('fits and centres the board when entering fullscreen', async ({ page }) => {
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

  await page.goto(BEAT);
  await page.getByRole('button', { name: 'Add Repository map' }).click();
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.canvas-root');
    if (root) {
      root.style.position = 'fixed';
      root.style.inset = '0';
      root.style.width = '100vw';
      root.style.height = '100vh';
    }
  });
  await page.getByTestId('canvas-view').focus();
  await page.keyboard.press('f');
  await expect(page.getByText('Press F or Esc to return')).toBeVisible();

  const root = await page.getByTestId('canvas-view').boundingBox();
  expect(root).not.toBeNull();
  const cards = await page.getByTestId('canvas-diagram-card').evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
    }),
  );
  expect(cards.length).toBe(2);
  for (const card of cards) {
    expect(card.x).toBeGreaterThanOrEqual(root!.x - 1);
    expect(card.y).toBeGreaterThanOrEqual(root!.y - 1);
    expect(card.right).toBeLessThanOrEqual(root!.x + root!.width + 1);
    expect(card.bottom).toBeLessThanOrEqual(root!.y + root!.height + 1);
  }
});
