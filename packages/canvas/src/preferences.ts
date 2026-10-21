/**
 * Canvas view preferences are local to one browser and do not sync through an
 * account. The schema lives here, in pure TypeScript, so the canvas package can
 * validate whatever a previous build or a hand-edited storage entry left behind
 * without importing a schema library or the DOM.
 */
export type CanvasMotionPreference = 'system' | 'reduce' | 'full';
export type CanvasContrastPreference = 'system' | 'more';
export type CanvasPalettePreference = 'default' | 'colorblind';
export type CanvasTextScale = 100 | 125 | 150 | 200;

export interface CanvasPreferences {
  autoZoom: boolean;
  autoArrange: boolean;
  followBeat: boolean;
  motion: CanvasMotionPreference;
  contrast: CanvasContrastPreference;
  palette: CanvasPalettePreference;
  textScale: CanvasTextScale;
  seenAutoZoom: boolean;
  seenAutoArrange: boolean;
}

/**
 * Optional behaviours start on because the first-run messages explain them and
 * offer an in-place disable. Accessibility stays on the system default until
 * the viewer asks for more contrast, less motion, a different palette, or
 * larger text.
 */
export const DEFAULT_CANVAS_PREFERENCES: CanvasPreferences = {
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

const MOTION_VALUES: readonly CanvasMotionPreference[] = ['system', 'reduce', 'full'];
const CONTRAST_VALUES: readonly CanvasContrastPreference[] = ['system', 'more'];
const PALETTE_VALUES: readonly CanvasPalettePreference[] = ['default', 'colorblind'];
const TEXT_SCALE_VALUES: readonly CanvasTextScale[] = [100, 125, 150, 200];

/**
 * Storage may hold anything: a missing key, an old shape, an array, or a value
 * the user edited by hand. Parsing never throws and never keeps an unknown key,
 * so a malformed field costs only that field's value.
 */
export function parseCanvasPreferences(value: unknown): CanvasPreferences {
  return readPreferences(value, DEFAULT_CANVAS_PREFERENCES);
}

/**
 * Applies the fields the viewer changed and keeps the rest. An invalid patch
 * value leaves the current value in place instead of resetting a valid
 * preference to its default.
 */
export function patchCanvasPreferences(
  current: CanvasPreferences,
  patch: Partial<CanvasPreferences>,
): CanvasPreferences {
  const base = readPreferences(current, DEFAULT_CANVAS_PREFERENCES);
  return readPreferences(patch, base);
}

function readPreferences(value: unknown, fallback: CanvasPreferences): CanvasPreferences {
  const source: Record<string, unknown> = isRecord(value) ? value : {};
  return {
    autoZoom: booleanOr(source.autoZoom, fallback.autoZoom),
    autoArrange: booleanOr(source.autoArrange, fallback.autoArrange),
    followBeat: booleanOr(source.followBeat, fallback.followBeat),
    motion: oneOf(source.motion, MOTION_VALUES, fallback.motion),
    contrast: oneOf(source.contrast, CONTRAST_VALUES, fallback.contrast),
    palette: oneOf(source.palette, PALETTE_VALUES, fallback.palette),
    textScale: oneOf(source.textScale, TEXT_SCALE_VALUES, fallback.textScale),
    seenAutoZoom: booleanOr(source.seenAutoZoom, fallback.seenAutoZoom),
    seenAutoArrange: booleanOr(source.seenAutoArrange, fallback.seenAutoArrange),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function oneOf<T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
