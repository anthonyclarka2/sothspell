import { describe, expect, it, vi } from 'vitest';
import { CANVAS_EXPORT_MAX_DIMENSION, CANVAS_EXPORT_SCALE } from '@sothspell/canvas';
import { captureCanvasImage, captureScale } from './canvas-export.js';
import type { CanvasScreenshotOptions } from './canvas-export.js';

function fakeRoot(): HTMLElement {
  return { dataset: {} } as unknown as HTMLElement;
}

function fakeBoard(width = 1000, height = 600): HTMLElement {
  return {
    getBoundingClientRect: () => ({ width, height }),
  } as unknown as HTMLElement;
}

function blob(): Blob {
  return new Blob(['capture'], { type: 'image/png' });
}

describe('captureScale', () => {
  it('uses the device scale for ordinary boards', () => {
    expect(captureScale(1000, 600)).toBe(CANVAS_EXPORT_SCALE);
  });

  it('downscales so the largest dimension never exceeds the cap', () => {
    expect(captureScale(6000, 3000)).toBeCloseTo(8192 / 6000, 6);
    expect(captureScale(10000, 10000)).toBeCloseTo(8192 / 10000, 6);
    for (const [width, height] of [
      [6000, 3000],
      [10000, 10000],
      [300, 12000],
    ] as const) {
      const scale = captureScale(width, height);
      expect(Math.round(width * scale)).toBeLessThanOrEqual(CANVAS_EXPORT_MAX_DIMENSION);
      expect(Math.round(height * scale)).toBeLessThanOrEqual(CANVAS_EXPORT_MAX_DIMENSION);
    }
  });

  it('keeps the device scale when a dimension is missing', () => {
    expect(captureScale(0, 0)).toBe(CANVAS_EXPORT_SCALE);
  });
});

describe('captureCanvasImage', () => {
  it('marks the root for hiding, reports the scaled pixels, and downloads', async () => {
    const root = fakeRoot();
    const board = fakeBoard();
    let exportModeDuringCapture: string | undefined;
    const screenshot = vi.fn(
      async (_node: HTMLElement, _options: CanvasScreenshotOptions) => {
        exportModeDuringCapture = root.dataset['canvasExport'];
        return blob();
      },
    );
    const download = vi.fn();
    const waitForPaint = vi.fn(async () => undefined);

    const result = await captureCanvasImage({
      root,
      board,
      format: 'png',
      filename: 'sothspell-fixture-beat-view.png',
      screenshot,
      download,
      waitForPaint,
    });

    expect(exportModeDuringCapture).toBe('image');
    expect(root.dataset['canvasExport']).toBeUndefined();
    expect(waitForPaint).toHaveBeenCalledTimes(1);
    expect(screenshot).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(
      expect.any(Blob),
      'sothspell-fixture-beat-view.png',
    );
    expect(result).toEqual({
      filename: 'sothspell-fixture-beat-view.png',
      width: 2000,
      height: 1200,
      scale: 2,
      mimeType: 'image/png',
    });
    expect(screenshot.mock.calls[0]?.[1]).toMatchObject({
      type: 'image/png',
      scale: 2,
      width: 1000,
      height: 600,
      maximumCanvasSize: CANVAS_EXPORT_MAX_DIMENSION,
    });
  });

  it('asks for JPEG when the format is jpg', async () => {
    const screenshot = vi.fn(
      async (_node: HTMLElement, _options: CanvasScreenshotOptions) => blob(),
    );

    const result = await captureCanvasImage({
      root: fakeRoot(),
      board: fakeBoard(),
      format: 'jpg',
      filename: 'sothspell-fixture-beat-board.jpg',
      screenshot,
      download: vi.fn(),
      waitForPaint: async () => undefined,
    });

    expect(result.mimeType).toBe('image/jpeg');
    expect(screenshot.mock.calls[0]?.[1]).toMatchObject({
      type: 'image/jpeg',
      quality: 0.92,
    });
  });

  it('runs prepare before the wait and capture, then restores after', async () => {
    const order: string[] = [];
    const root = fakeRoot();

    await captureCanvasImage({
      root,
      board: fakeBoard(),
      format: 'png',
      filename: 'board.png',
      prepare: async () => {
        order.push('prepare');
      },
      restore: async () => {
        order.push('restore');
        expect(root.dataset['canvasExport']).toBeUndefined();
      },
      waitForPaint: async () => {
        order.push('wait');
      },
      screenshot: async () => {
        order.push('screenshot');
        expect(root.dataset['canvasExport']).toBe('image');
        return blob();
      },
      download: () => {
        order.push('download');
      },
    });

    expect(order).toEqual(['prepare', 'wait', 'screenshot', 'download', 'restore']);
  });

  it('restores export mode and the board when the capture fails', async () => {
    const root = fakeRoot();
    const download = vi.fn();
    const restore = vi.fn(async () => undefined);
    const failure = new Error('canvas is too large');

    await expect(
      captureCanvasImage({
        root,
        board: fakeBoard(),
        format: 'png',
        filename: 'board.png',
        restore,
        waitForPaint: async () => undefined,
        screenshot: async () => {
          expect(root.dataset['canvasExport']).toBe('image');
          throw failure;
        },
        download,
      }),
    ).rejects.toBe(failure);

    expect(root.dataset['canvasExport']).toBeUndefined();
    expect(download).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('caps the requested scale and reports the capped pixel size', async () => {
    const screenshot = vi.fn(
      async (_node: HTMLElement, _options: CanvasScreenshotOptions) => blob(),
    );

    const result = await captureCanvasImage({
      root: fakeRoot(),
      board: fakeBoard(6000, 3000),
      format: 'png',
      filename: 'large.png',
      screenshot,
      download: vi.fn(),
      waitForPaint: async () => undefined,
    });

    expect(result.scale).toBeCloseTo(8192 / 6000, 6);
    expect(result.width).toBe(8192);
    expect(result.height).toBe(4096);
    expect(screenshot.mock.calls[0]?.[1]?.scale).toBeCloseTo(8192 / 6000, 6);
  });
});
