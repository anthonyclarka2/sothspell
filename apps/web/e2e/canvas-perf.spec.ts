import { expect, test } from '@playwright/test';
import {
  CANVAS_SYMBOLS,
  installCanvasSymbolTargets,
  installFakeCanvasRelations,
} from './canvas-relations-fake.js';

/**
 * The CI guard for the canvas frame budget. It samples rAF intervals during a
 * scripted pan/zoom on a representative board: the golden two-diagram scene,
 * every beat container expanded, and both relation directions open.
 *
 * The plan keeps CI generous (p95 <= 20 ms, no long task over 100 ms) while the
 * owner records the real p95 on the reference machine. A local run reports the
 * numbers without failing on browser noise; CI enforces them.
 */

const PREFERENCES_KEY = 'sothspell:canvas-preferences:v1';

const BASE_PREFERENCES = {
  autoZoom: false,
  autoArrange: false,
  followBeat: false,
  motion: 'system',
  contrast: 'system',
  palette: 'default',
  textScale: 100,
  seenAutoZoom: true,
  seenAutoArrange: true,
};

const FRAME_BUDGET_P95_MS = 20;
const LONG_TASK_CEILING_MS = 100;
const SAMPLE_DURATION_MS = 3000;

const enforceGate = Boolean(process.env.CI);

interface CanvasPerfSample {
  frames: number[];
  longTasks: Array<{ startTime: number; duration: number }>;
  heapBytes: number | null;
}

interface CanvasPerfWindow extends Window {
  canvasPerfSample?: {
    frames: number[];
    longTasks: Array<{ startTime: number; duration: number }>;
    heapBytes: number | null;
    running: boolean;
    observer?: PerformanceObserver;
  };
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].toSorted((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

test('canvas meets the frame budget on a representative board', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: PREFERENCES_KEY, value: BASE_PREFERENCES },
  );

  // One beat container becomes a relation source; the other proves every beat
  // anchor is present. The fake routes keep the sample independent of Bunbun.
  installCanvasSymbolTargets(page, {
    anchors: { anchor_thread_loader: CANVAS_SYMBOLS.service },
  });
  installFakeCanvasRelations(page);

  await page.goto('/t/tour_bunbun_golden/beat_request_04?view=canvas');
  await expect(page.getByTestId('canvas-view')).toBeVisible();
  await expect(page.getByTestId('canvas-code-container')).toHaveCount(2);

  await page.getByRole('button', { name: 'Add The boot path' }).click();
  await expect(page.getByTestId('canvas-diagram-card')).toHaveCount(2);

  // Expand every code container so the sample measures the real reading DOM,
  // not just the first 24 collapsed lines. The second diagram focuses the boot
  // path, so an off-screen container cannot be clicked through the viewport;
  // dispatch the button activation directly - this step prepares the DOM, not
  // a keyboard or pointer journey.
  for (const container of await page.getByTestId('canvas-code-container').all()) {
    const showAll = container.getByRole('button', { name: /show all \d+ lines/i });
    if ((await showAll.count()) > 0) {
      await showAll.evaluate((button) => (button as HTMLElement).click());
    }
  }

  // Activating the object centres its container, which is the real journey a
  // viewer takes before expanding relations.
  await page
    .locator('[data-object-id="node_loader"]')
    .evaluate((object) => (object as HTMLElement).click());
  const source = page.locator('[data-container-id="anchor_thread_loader"]');
  await expect(source).toBeInViewport();
  await source.getByRole('button', { name: 'Incoming', exact: true }).click();
  await source.getByRole('button', { name: 'Outgoing', exact: true }).click();
  await expect(page.getByTestId('canvas-code-container')).toHaveCount(5);
  await expect(page.locator('[data-testid="canvas-flow-edge"]')).not.toHaveCount(0);

  await page.evaluate(() => document.fonts.ready);
  // Let the fit-all frame and the relation layout settle before sampling.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

  const counts = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.react-flow__node').length,
    edges: document.querySelectorAll('.react-flow__edge').length,
    diagrams: document.querySelectorAll('[data-testid="canvas-diagram-card"]').length,
    objects: document.querySelectorAll('[data-testid="canvas-object"]').length,
    containers: document.querySelectorAll('[data-testid="canvas-code-container"]').length,
  }));
  // The sample is only meaningful on a populated board.
  expect(counts.diagrams).toBe(2);
  expect(counts.containers).toBe(5);
  expect(counts.objects).toBeGreaterThan(0);
  expect(counts.nodes).toBeGreaterThan(10);

  // Pan from an empty point on the pane; a card would swallow the drag.
  const start = await page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>('.react-flow__pane');
    if (!pane) {
      return null;
    }
    const rect = pane.getBoundingClientRect();
    for (let y = rect.top + 24; y < rect.bottom - 24; y += 24) {
      for (let x = rect.left + 24; x < rect.right - 24; x += 24) {
        const element = document.elementFromPoint(x, y);
        if (element?.closest('.react-flow__node') === null) {
          return { x, y };
        }
      }
    }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  expect(start).not.toBeNull();

  await page.evaluate(() => {
    const perfWindow = window as CanvasPerfWindow;
    const sample: NonNullable<CanvasPerfWindow['canvasPerfSample']> = {
      frames: [],
      longTasks: [],
      heapBytes:
        'memory' in performance
          ? ((performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
              ?.usedJSHeapSize ?? null)
          : null,
      running: true,
    };
    perfWindow.canvasPerfSample = sample;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        sample.longTasks.push({
          startTime: entry.startTime,
          duration: entry.duration,
        });
      }
    });
    try {
      observer.observe({ type: 'longtask', buffered: false });
    } catch {
      // Older Chromium builds only expose longtask through entryTypes.
      observer.observe({ entryTypes: ['longtask'] });
    }
    sample.observer = observer;

    const tick = (time: number) => {
      if (!sample.running) {
        return;
      }
      sample.frames.push(time);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const viewportTransform = () =>
    page.evaluate(
      () =>
        document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ??
        '',
    );
  const transformBefore = await viewportTransform();

  const started = Date.now();
  let step = 0;
  await page.mouse.move(start!.x, start!.y);
  await page.mouse.down();
  while (Date.now() - started < SAMPLE_DURATION_MS) {
    const progress = (Date.now() - started) / SAMPLE_DURATION_MS;
    const x = start!.x + Math.sin(progress * Math.PI * 2) * 160;
    const y = start!.y + Math.cos(progress * Math.PI * 2) * 90;
    await page.mouse.move(x, y);
    if (step % 12 === 0) {
      await page.mouse.wheel(0, step % 24 === 0 ? -80 : 80);
    }
    await page.waitForTimeout(10);
    step += 1;
  }
  await page.mouse.up();

  // A sampler over a board that never moved would report idle frames, not the
  // pan/zoom the budget is about.
  expect(await viewportTransform()).not.toBe(transformBefore);

  const sample = await page.evaluate<CanvasPerfSample>(() => {
    const perfWindow = window as CanvasPerfWindow;
    const current = perfWindow.canvasPerfSample;
    if (!current) {
      return { frames: [], longTasks: [], heapBytes: null };
    }
    current.running = false;
    current.observer?.disconnect();
    return {
      frames: current.frames,
      longTasks: current.longTasks,
      heapBytes: current.heapBytes,
    };
  });

  const intervals: number[] = [];
  for (let index = 1; index < sample.frames.length; index += 1) {
    intervals.push(sample.frames[index]! - sample.frames[index - 1]!);
  }
  const summary = {
    frames: sample.frames.length,
    intervals: intervals.length,
    p50: Number(percentile(intervals, 0.5).toFixed(2)),
    p95: Number(percentile(intervals, 0.95).toFixed(2)),
    max: Number(Math.max(0, ...intervals).toFixed(2)),
    longTasks: sample.longTasks.length,
    maxLongTaskMs: Number(
      Math.max(0, ...sample.longTasks.map((task) => task.duration)).toFixed(2),
    ),
    heapBytes: sample.heapBytes,
    counts,
    enforced: enforceGate,
  };

  // The counts and numbers are the report the phase records; keep them in the
  // test output even when the gate is enforced.
  console.log(`[canvas-perf] ${JSON.stringify(summary)}`);
  test.info().annotations.push({
    type: 'canvas-perf',
    description: JSON.stringify(summary),
  });

  // A sampler that never ran cannot prove anything.
  expect(summary.intervals).toBeGreaterThan(30);

  if (enforceGate) {
    expect(summary.p95, 'p95 frame interval').toBeLessThanOrEqual(FRAME_BUDGET_P95_MS);
    expect(summary.maxLongTaskMs, 'longest task').toBeLessThanOrEqual(
      LONG_TASK_CEILING_MS,
    );
  }
});
