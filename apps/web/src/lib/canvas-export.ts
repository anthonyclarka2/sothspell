import { CANVAS_EXPORT_MAX_DIMENSION, CANVAS_EXPORT_SCALE } from '@sothspell/canvas';

/**
 * The browser adapter for PNG and JPG export. The pure export model names the
 * file and describes the captured rectangle; this module owns the parts that
 * need a DOM: hiding transient UI, waiting for fonts, asking
 * modern-screenshot for pixels, and downloading the result. It accepts the
 * screenshot function and downloader as dependencies so a unit test can prove
 * the restore path without a browser.
 */

export interface CanvasScreenshotOptions {
  type: 'image/png' | 'image/jpeg';
  quality?: number;
  scale: number;
  width: number;
  height: number;
  maximumCanvasSize: number;
  backgroundColor?: string;
}

export type CanvasScreenshot = (
  node: HTMLElement,
  options: CanvasScreenshotOptions,
) => Promise<Blob>;

export type CanvasDownload = (blob: Blob, filename: string) => void;

export interface CaptureCanvasImageOptions {
  root: HTMLElement;
  /** The element captured; the board or the compact reading layout. */
  board: HTMLElement;
  format: 'png' | 'jpg';
  filename: string;
  /** Runs before capture; whole-board export fits all cards here. */
  prepare?: () => Promise<void>;
  /** Runs after capture on success and failure; restores the viewport. */
  restore?: () => Promise<void>;
  screenshot?: CanvasScreenshot;
  download?: CanvasDownload;
  waitForPaint?: () => Promise<void>;
  backgroundColor?: string;
  deviceScale?: number;
  maxDimension?: number;
}

export interface CanvasCaptureResult {
  filename: string;
  width: number;
  height: number;
  scale: number;
  mimeType: 'image/png' | 'image/jpeg';
}

/**
 * Device-pixel scale for a capture. Scale 2 is the quality target, but a board
 * larger than the browser's canvas ceiling is downscaled instead of returning
 * a blank image.
 */
export function captureScale(
  width: number,
  height: number,
  deviceScale = CANVAS_EXPORT_SCALE,
  maxDimension = CANVAS_EXPORT_MAX_DIMENSION,
): number {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) {
    return deviceScale;
  }
  return Math.min(deviceScale, maxDimension / longest);
}

/**
 * Fonts and two animation frames. A capture taken before the webfont swaps in
 * produces text in a fallback face; a capture taken before React Flow applies
 * a viewport transition produces the previous transform.
 */
export async function waitForCanvasPaint(): Promise<void> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // A font failure must not block the export; the capture still has text.
    }
  }
  await nextFrame();
  await nextFrame();
}

function nextFrame(): Promise<void> {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function modernScreenshot(
  node: HTMLElement,
  options: CanvasScreenshotOptions,
): Promise<Blob> {
  const { domToBlob } = await import('modern-screenshot');
  return domToBlob(node, {
    type: options.type,
    ...(options.quality === undefined ? {} : { quality: options.quality }),
    scale: options.scale,
    width: options.width,
    height: options.height,
    maximumCanvasSize: options.maximumCanvasSize,
    ...(options.backgroundColor === undefined
      ? {}
      : { backgroundColor: options.backgroundColor }),
  });
}

/** A blob URL keeps large PNGs out of the data-URL size limit. */
export function downloadCanvasBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a turn to start reading the blob before revoking it.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readBackgroundColor(root: HTMLElement): string | undefined {
  if (typeof getComputedStyle !== 'function') {
    return undefined;
  }
  const colour = getComputedStyle(root).backgroundColor;
  return colour === '' || colour === 'transparent' || colour === 'rgba(0, 0, 0, 0)'
    ? undefined
    : colour;
}

export async function captureCanvasImage(
  options: CaptureCanvasImageOptions,
): Promise<CanvasCaptureResult> {
  const {
    root,
    board,
    format,
    filename,
    prepare,
    restore,
    screenshot = modernScreenshot,
    download = downloadCanvasBlob,
    waitForPaint = waitForCanvasPaint,
  } = options;
  const rect = board.getBoundingClientRect();
  const scale = captureScale(
    rect.width,
    rect.height,
    options.deviceScale ?? CANVAS_EXPORT_SCALE,
    options.maxDimension ?? CANVAS_EXPORT_MAX_DIMENSION,
  );
  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const backgroundColor = options.backgroundColor ?? readBackgroundColor(root);

  try {
    await prepare?.();
    root.dataset['canvasExport'] = 'image';
    await waitForPaint();
    const blob = await screenshot(board, {
      type: mimeType,
      ...(format === 'jpg' ? { quality: 0.92 } : {}),
      scale,
      width: rect.width,
      height: rect.height,
      maximumCanvasSize: options.maxDimension ?? CANVAS_EXPORT_MAX_DIMENSION,
      ...(backgroundColor === undefined ? {} : { backgroundColor }),
    });
    download(blob, filename);
    return {
      filename,
      width: Math.round(rect.width * scale),
      height: Math.round(rect.height * scale),
      scale,
      mimeType,
    };
  } finally {
    // Restore the visible board before removing the capture marker: the
    // viewport transition is allowed to move chrome that was hidden for only
    // the duration of the capture.
    delete root.dataset['canvasExport'];
    await restore?.();
  }
}
