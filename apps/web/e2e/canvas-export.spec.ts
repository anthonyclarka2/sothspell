import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  CANVAS_SYMBOLS,
  installCanvasSymbolTargets,
  installFakeCanvasRelations,
} from './canvas-relations-fake.js';

const SCREENSHOT_ROUTE = '**/modern-screenshot.js*';

const FAKE_SCREENSHOT_MODULE = `
const selectors = [
  '.canvas-controls',
  '.canvas-tray',
  '.canvas-outline',
  '.canvas-notice',
  '.canvas-display',
  '.canvas-export',
  '.canvas-relation-legend',
];

function record(node, options) {
  const root = document.querySelector('.canvas-root');
  const board = node.getBoundingClientRect();
  const display = {};
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    display[selector] = element === null ? 'missing' : getComputedStyle(element).display;
  }
  const inside = (rect) =>
    rect.left >= board.left - 1 &&
    rect.top >= board.top - 1 &&
    rect.right <= board.right + 1 &&
    rect.bottom <= board.bottom + 1;

  window.sothspellCanvasExportCapture = {
    options: {
      type: options.type,
      scale: options.scale,
      width: options.width,
      height: options.height,
      maximumCanvasSize: options.maximumCanvasSize,
      backgroundColor: options.backgroundColor,
    },
    exportMode: root === null ? null : root.dataset.canvasExport ?? null,
    display,
    background: root === null ? null : getComputedStyle(root).backgroundColor,
    diagrams: [...node.querySelectorAll('[data-canvas-diagram="true"]')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.dataset.diagramId ?? '', inside: inside(rect) };
    }),
    containers: [...node.querySelectorAll('[data-canvas-container="true"]')].map(
      (element) => element.dataset.containerId ?? '',
    ),
  };
  return new Blob(['fake-capture'], { type: options.type });
}

export async function domToBlob(node, options) {
  return record(node, options);
}

export async function domToPng(node, options) {
  return record(node, options);
}

export async function domToJpeg(node, options) {
  return record(node, options);
}
`;

const FAIL_ONCE_SCREENSHOT_MODULE = `const key = 'sothspell:canvas-export-failed-once';

function record(node, options) {
  const root = document.querySelector('.canvas-root');
  const board = node.getBoundingClientRect();
  const inside = (rect) =>
    rect.left >= board.left - 1 &&
    rect.top >= board.top - 1 &&
    rect.right <= board.right + 1 &&
    rect.bottom <= board.bottom + 1;
  window.sothspellCanvasExportCapture = {
    options: { scale: options.scale, type: options.type, maximumCanvasSize: options.maximumCanvasSize },
    exportMode: root === null ? null : root.dataset.canvasExport ?? null,
    diagrams: [...node.querySelectorAll('[data-canvas-diagram="true"]')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.dataset.diagramId ?? '', inside: inside(rect) };
    }),
  };
  return new Blob(['retry-capture'], { type: options.type });
}

export async function domToBlob(node, options) {
  if (window.sessionStorage.getItem(key) === null) {
    window.sessionStorage.setItem(key, '1');
    throw new Error('simulated capture failure');
  }
  return record(node, options);
}

export async function domToPng(node, options) {
  return domToBlob(node, options);
}

export async function domToJpeg(node, options) {
  return domToBlob(node, options);
}
`;

async function installFakeScreenshot(
  page: Page,
  body = FAKE_SCREENSHOT_MODULE,
): Promise<void> {
  await page.route(SCREENSHOT_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body,
    }),
  );
}

async function openExport(page: Page): Promise<void> {
  await page.getByTestId('canvas-export-button').click();
  await expect(page.getByTestId('canvas-export-panel')).toBeVisible();
}

/**
 * Read the unrounded viewport scale. A zoom button starts a 280 ms transition,
 * so the percentage readout can be captured mid-animation; the transform is the
 * only reliable way to know where the board actually settled.
 */
async function canvasZoom(page: Page): Promise<number> {
  return page.locator('.react-flow__viewport').evaluate((element) => {
    const match = /scale\(([-\d.eE+]+)\)/.exec((element as HTMLElement).style.transform);
    return match ? Number(match[1]) : Number.NaN;
  });
}

async function waitForStableZoom(page: Page): Promise<number> {
  let previous = await canvasZoom(page);
  let stableSamples = 0;
  for (let attempt = 0; attempt < 30 && stableSamples < 3; attempt += 1) {
    await page.waitForTimeout(50);
    const current = await canvasZoom(page);
    stableSamples = Math.abs(current - previous) < 0.0001 ? stableSamples + 1 : 0;
    previous = current;
  }
  return previous;
}

async function imageDimensions(path: string): Promise<{ width: number; height: number }> {
  const file = await readFile(path);
  expect(file.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
}

test('downloads PNG and JPG captures with the export model names', async ({ page }) => {
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  await expect(page.getByTestId('canvas-view')).toBeVisible();
  const board = await page.locator('.canvas-board').boundingBox();
  expect(board).not.toBeNull();

  await openExport(page);
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /PNG · current view/i }).click();
  const png = await pngDownload;
  expect(png.suggestedFilename()).toBe('sothspell-bunbun-beat-purpose-01-view.png');
  const pngPath = await png.path();
  expect(pngPath).not.toBeNull();
  const dimensions = await imageDimensions(pngPath!);
  expect(Math.abs(dimensions.width - board!.width * 2)).toBeLessThanOrEqual(2);
  expect(Math.abs(dimensions.height - board!.height * 2)).toBeLessThanOrEqual(2);

  await openExport(page);
  const jpgDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /JPG · whole board/i }).click();
  const jpg = await jpgDownload;
  expect(jpg.suggestedFilename()).toBe('sothspell-bunbun-beat-purpose-01-board.jpg');
  const jpgPath = await jpg.path();
  expect(jpgPath).not.toBeNull();
  const jpgBytes = await readFile(jpgPath!);
  expect(jpgBytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  expect(jpgBytes.byteLength).toBeGreaterThan(1000);
});

test('whole-board capture hides chrome, includes an off-screen card, and restores the viewport', async ({
  page,
}) => {
  await installFakeScreenshot(page);
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  await page.getByRole('button', { name: 'Add Repository map' }).click();
  await expect(
    page.getByTestId('canvas-diagram-card').filter({ hasText: 'Repository map' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Home diagram' }).click();
  await page.waitForTimeout(320);
  // Pan the board down so the satellite is fully outside the viewport; the
  // whole-board export has to fit it back in before capturing.
  await page.mouse.move(300, 250);
  await page.mouse.down();
  await page.mouse.move(300, 460, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(260);

  const board = await page.locator('.canvas-board').boundingBox();
  const offscreen = await page
    .locator('[data-canvas-diagram="true"][data-diagram-id="diagram_repo_map"]')
    .boundingBox();
  expect(board).not.toBeNull();
  expect(offscreen).not.toBeNull();
  const wasOffscreen =
    offscreen!.x + offscreen!.width < board!.x ||
    offscreen!.y + offscreen!.height < board!.y ||
    offscreen!.x > board!.x + board!.width ||
    offscreen!.y > board!.y + board!.height;
  expect(wasOffscreen).toBe(true);

  const zoomBefore = await page.locator('.canvas-zoom-readout').innerText();

  await openExport(page);
  await page.getByRole('button', { name: /PNG · whole board/i }).click();
  await expect
    .poll(async () => page.evaluate(() => Boolean(window.sothspellCanvasExportCapture)))
    .toBe(true);
  const capture = await page.evaluate(() => window.sothspellCanvasExportCapture);

  expect(capture.exportMode).toBe('image');
  expect(capture.options).toMatchObject({
    type: 'image/png',
    scale: 2,
    maximumCanvasSize: 8192,
  });
  expect(capture.options.width).toBeCloseTo(board!.width, 0);
  expect(capture.options.height).toBeCloseTo(board!.height, 0);
  expect(capture.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(capture.options.backgroundColor).toBeTruthy();
  for (const selector of [
    '.canvas-controls',
    '.canvas-tray',
    '.canvas-outline',
    '.canvas-display',
    '.canvas-export',
    '.canvas-relation-legend',
  ]) {
    expect(['none', 'missing'], selector).toContain(capture.display[selector]);
  }
  expect(capture.diagrams.map((diagram) => diagram.id).toSorted()).toEqual(
    ['diagram_repo_map', 'diagram_sources'].toSorted(),
  );
  for (const diagram of capture.diagrams) {
    expect(diagram.inside, diagram.id).toBe(true);
  }
  expect(capture.containers.length).toBeGreaterThan(0);

  await expect(page.getByTestId('canvas-export-panel')).toHaveCount(0);
  await expect(page.locator('.canvas-controls')).toBeVisible();
  await expect
    .poll(async () => page.locator('.canvas-zoom-readout').innerText())
    .toBe(zoomBefore);
  await expect(page.getByTestId('canvas-view')).not.toHaveAttribute(
    'data-canvas-export',
    'image',
  );
});

test('a failed capture shows an inline error, restores the board, and retries', async ({
  page,
}) => {
  await installFakeScreenshot(page, FAIL_ONCE_SCREENSHOT_MODULE);
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  const zoomBefore = await waitForStableZoom(page);

  await openExport(page);
  await page.getByRole('button', { name: /PNG · whole board/i }).click();
  const error = page.getByTestId('canvas-export-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText('The export did not finish.');
  await expect(error.getByRole('button', { name: 'Retry' })).toBeFocused();

  await expect(page.getByTestId('canvas-view')).not.toHaveAttribute(
    'data-canvas-export',
    'image',
  );
  await expect(page.locator('.canvas-controls')).toBeVisible();
  await expect(page.locator('.canvas-tray')).toBeVisible();
  await expect.poll(() => canvasZoom(page)).toBeCloseTo(zoomBefore, 4);

  const retryDownload = page.waitForEvent('download');
  await error.getByRole('button', { name: 'Retry' }).click();
  const download = await retryDownload;
  expect(download.suggestedFilename()).toBe('sothspell-bunbun-beat-purpose-01-board.png');
  await expect(page.getByTestId('canvas-export-panel')).toHaveCount(0);
  expect(
    await page.evaluate(() => window.sothspellCanvasExportCapture?.exportMode ?? null),
  ).toBe('image');
});

test('print media shows the full-anchor print sheet with no controls', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.sothspellPrintCalls = 0;
    window.print = () => {
      window.sothspellPrintCalls += 1;
    };
  });
  await page.goto('/t/tour_bunbun_golden/beat_request_01?view=canvas');
  await page.getByTestId('canvas-object').filter({ hasText: 'main.ts' }).click();
  await expect(page.getByTestId('canvas-code-container')).toHaveCount(1);

  await openExport(page);
  await page.getByRole('button', { name: /PDF · print layout/i }).click();
  await expect.poll(() => page.evaluate(() => window.sothspellPrintCalls)).toBe(1);

  const printView = page.getByTestId('canvas-print-view');
  await expect(printView).toHaveCount(1);
  await expect(printView).toBeHidden();

  await page.emulateMedia({ media: 'print' });
  await expect(printView).toBeVisible();
  await expect(printView.getByRole('heading', { level: 1 })).toContainText(
    'Boot is one explicit path',
  );
  await expect(printView).toContainText('9fef24d');
  await expect(printView).toContainText('Exported');
  await expect(printView.getByTestId('canvas-print-container')).toHaveCount(1);
  await expect(
    printView.locator('[data-print-container-id="anchor_main_bootstrap"]'),
  ).toHaveAttribute('data-print-source', 'anchor');
  // A 31-line anchor is complete even though the board keeps 24 lines in the DOM.
  await expect(
    printView.locator('[data-print-container-id] [data-line="25"]'),
  ).toHaveCount(1);
  await expect(
    printView.locator('[data-print-container-id] [data-line="31"]'),
  ).toHaveCount(1);

  const card = printView.getByTestId('canvas-print-container').first();
  await expect(card).toHaveCSS('break-inside', 'avoid');
  const code = card.locator('.canvas-print-code');
  await expect(code).toHaveCSS('white-space', 'pre-wrap');
  expect(
    await code.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);

  await expect(page.locator('.canvas-controls')).toBeHidden();
  await expect(page.locator('.canvas-tray')).toBeHidden();
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('.transport')).toBeHidden();

  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(printView).toHaveCount(0);
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('.canvas-controls')).toBeVisible();
  await expect(page.getByTestId('canvas-export-button')).toBeFocused();
});

test('the print sheet stays readable at 375 px from the compact canvas', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.sothspellPrintCalls = 0;
    window.print = () => {
      window.sothspellPrintCalls += 1;
    };
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/t/tour_bunbun_golden/beat_request_01?view=canvas');
  await expect(page.getByTestId('canvas-compact')).toBeVisible();
  await page.getByTestId('canvas-object').filter({ hasText: 'main.ts' }).click();
  await expect(page.getByTestId('canvas-code-container')).toHaveCount(1);

  await page.getByTestId('canvas-export-button').click();
  await page.getByRole('button', { name: /PDF · print layout/i }).click();
  await expect.poll(() => page.evaluate(() => window.sothspellPrintCalls)).toBe(1);

  await page.emulateMedia({ media: 'print' });
  const printView = page.getByTestId('canvas-print-view');
  await expect(printView).toBeVisible();
  await expect(
    printView.locator('[data-print-container-id] [data-line="31"]'),
  ).toHaveCount(1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await expect(page.locator('.canvas-controls')).toHaveCount(0);
});

test('opens the export menu from the keyboard and returns focus on Escape', async ({
  page,
}) => {
  await page.goto('/t/tour_bunbun_golden/beat_purpose_01?view=canvas');
  const trigger = page.getByTestId('canvas-export-button');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('canvas-export-panel')).toBeVisible();
  await expect(page.getByRole('button', { name: /PNG · current view/i })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('canvas-export-panel')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('print keeps a bounded relation excerpt and its relation label', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  installCanvasSymbolTargets(page, {
    anchors: { anchor_comments_create: CANVAS_SYMBOLS.service },
  });
  installFakeCanvasRelations(page);
  await page.goto('/t/tour_bunbun_golden/beat_write_02?view=canvas');
  await page.getByTestId('canvas-object').filter({ hasText: 'CommentsService' }).click();
  const source = page.locator('[data-container-id="anchor_comments_create"]');
  await expect(source).toBeVisible();
  await source.getByRole('button', { name: 'Incoming', exact: true }).click();
  const caller = page.locator(
    `[data-testid="canvas-code-container"][data-symbol-id="${CANVAS_SYMBOLS.caller}"]`,
  );
  await expect(caller).toBeVisible();

  await openExport(page);
  await page.getByRole('button', { name: /PDF · print layout/i }).click();
  await page.emulateMedia({ media: 'print' });

  const relationCard = page.locator(
    `[data-print-container-id="relation:${CANVAS_SYMBOLS.caller}"]`,
  );
  await expect(relationCard).toBeVisible();
  await expect(relationCard).toHaveAttribute('data-print-source', 'relation');
  await expect(relationCard).toContainText('Bounded relation excerpt');
  await expect(relationCard).toContainText('CommentsController.create');
  await expect(relationCard).toContainText('calls · static');
  await expect(relationCard).toContainText('return this.comments.create(input);');

  const sourceCard = page.locator('[data-print-container-id="anchor_comments_create"]');
  await expect(sourceCard).toHaveAttribute('data-print-source', 'anchor');
  await expect(sourceCard).toContainText('Called by CommentsController.create');

  const summary = page
    .getByTestId('canvas-print-view')
    .locator('.canvas-print-relations li')
    .first();
  await expect(summary).toContainText('CommentsController.create');
  await expect(summary).toContainText('CommentsService.create');
  await expect(summary).toContainText('calls · static');
});
