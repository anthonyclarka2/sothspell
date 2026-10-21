/**
 * Canvas view preferences live in the browser, not in the tour or the run.
 * The module is deliberately framework-free: the React canvas subscribes to a
 * small store, while unit tests pass a structural storage fake. Every read is
 * validated so a hand-edited value or an older payload cannot break the board.
 */

export const CANVAS_PREFERENCES_KEY = 'sothspell:canvas-preferences:v1';
export const CANVAS_LAYOUTS_KEY = 'sothspell:canvas-layouts:v1';

export const CANVAS_MOTION_VALUES = ['system', 'reduce', 'full'] as const;
export const CANVAS_CONTRAST_VALUES = ['system', 'more'] as const;
export const CANVAS_PALETTE_VALUES = ['default', 'colorblind'] as const;
export const CANVAS_TEXT_SCALE_VALUES = [100, 125, 150, 200] as const;

export type CanvasMotionPreference = (typeof CANVAS_MOTION_VALUES)[number];
export type CanvasContrastPreference = (typeof CANVAS_CONTRAST_VALUES)[number];
export type CanvasPalettePreference = (typeof CANVAS_PALETTE_VALUES)[number];
export type CanvasTextScale = (typeof CANVAS_TEXT_SCALE_VALUES)[number];

export interface CanvasPreferences {
  /** Frame a newly opened code container with the container that opened it. */
  autoZoom: boolean;
  /** Run the deterministic layout and frame it after a container opens. */
  autoArrange: boolean;
  /** Follow the beat when playback advances. */
  followBeat: boolean;
  motion: CanvasMotionPreference;
  contrast: CanvasContrastPreference;
  palette: CanvasPalettePreference;
  textScale: CanvasTextScale;
  /** First-run notices; once seen, the shortcut sheet still exposes the actions. */
  seenAutoZoom: boolean;
  seenAutoArrange: boolean;
}

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

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CanvasPreferencesOptions {
  storage?: PreferenceStorage | null;
  key?: string;
}

export interface CanvasPreferenceStore {
  get(): CanvasPreferences;
  update(patch: Partial<CanvasPreferences>): CanvasPreferences;
  reset(): CanvasPreferences;
  subscribe(listener: (next: CanvasPreferences) => void): () => void;
}

export interface SavedCanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export type SavedCanvasViewports = Record<string, SavedCanvasViewport>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function textScaleOr(value: unknown, fallback: CanvasTextScale): CanvasTextScale {
  return typeof value === 'number' &&
    (CANVAS_TEXT_SCALE_VALUES as readonly number[]).includes(value)
    ? (value as CanvasTextScale)
    : fallback;
}

/** Invalid fields fall back individually, so one bad value keeps the rest. */
export function parseCanvasPreferences(value: unknown): CanvasPreferences {
  if (!isRecord(value)) {
    return { ...DEFAULT_CANVAS_PREFERENCES };
  }
  return {
    autoZoom: booleanOr(value.autoZoom, DEFAULT_CANVAS_PREFERENCES.autoZoom),
    autoArrange: booleanOr(value.autoArrange, DEFAULT_CANVAS_PREFERENCES.autoArrange),
    followBeat: booleanOr(value.followBeat, DEFAULT_CANVAS_PREFERENCES.followBeat),
    motion: oneOf(CANVAS_MOTION_VALUES, value.motion, DEFAULT_CANVAS_PREFERENCES.motion),
    contrast: oneOf(
      CANVAS_CONTRAST_VALUES,
      value.contrast,
      DEFAULT_CANVAS_PREFERENCES.contrast,
    ),
    palette: oneOf(
      CANVAS_PALETTE_VALUES,
      value.palette,
      DEFAULT_CANVAS_PREFERENCES.palette,
    ),
    textScale: textScaleOr(value.textScale, DEFAULT_CANVAS_PREFERENCES.textScale),
    seenAutoZoom: booleanOr(value.seenAutoZoom, DEFAULT_CANVAS_PREFERENCES.seenAutoZoom),
    seenAutoArrange: booleanOr(
      value.seenAutoArrange,
      DEFAULT_CANVAS_PREFERENCES.seenAutoArrange,
    ),
  };
}

function browserStorage(): PreferenceStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    // Privacy modes can throw on access; the canvas still works in memory.
    return null;
  }
}

export function readCanvasPreferences(
  storage: PreferenceStorage | null = browserStorage(),
): CanvasPreferences {
  if (!storage) {
    return { ...DEFAULT_CANVAS_PREFERENCES };
  }
  try {
    const raw = storage.getItem(CANVAS_PREFERENCES_KEY);
    if (raw === null) {
      return { ...DEFAULT_CANVAS_PREFERENCES };
    }
    return parseCanvasPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CANVAS_PREFERENCES };
  }
}

export function writeCanvasPreferences(
  preferences: CanvasPreferences,
  storage: PreferenceStorage | null = browserStorage(),
): CanvasPreferences {
  const parsed = parseCanvasPreferences(preferences);
  if (!storage) {
    return parsed;
  }
  try {
    storage.setItem(CANVAS_PREFERENCES_KEY, JSON.stringify(parsed));
  } catch {
    // A full or blocked store must not break playback.
  }
  return parsed;
}

export function resetCanvasPreferences(
  storage: PreferenceStorage | null = browserStorage(),
): CanvasPreferences {
  if (storage) {
    try {
      storage.removeItem(CANVAS_PREFERENCES_KEY);
    } catch {
      // Ignore: the in-memory defaults are still safe.
    }
  }
  return { ...DEFAULT_CANVAS_PREFERENCES };
}

/**
 * One store per canvas. Updates are merged through the parser and delivered to
 * subscribers, which keeps the display menu, the root data attributes, and the
 * auto-zoom commands reading the same value.
 */
export function createCanvasPreferenceStore(
  options: CanvasPreferencesOptions = {},
): CanvasPreferenceStore {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  let current = readCanvasPreferences(storage);
  const listeners = new Set<(next: CanvasPreferences) => void>();

  const emit = () => {
    // Snapshot so a listener can unsubscribe while the update is delivered.
    for (const listener of Array.from(listeners)) {
      listener(current);
    }
  };

  const commit = (next: CanvasPreferences) => {
    current = writeCanvasPreferences(next, storage);
    emit();
    return current;
  };

  return {
    get: () => current,
    update(patch) {
      return commit(parseCanvasPreferences({ ...current, ...patch }));
    },
    reset() {
      current = resetCanvasPreferences(storage);
      emit();
      return current;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseSavedCanvasViewport(value: unknown): SavedCanvasViewport | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    x: finiteOr(value.x, 0),
    y: finiteOr(value.y, 0),
    zoom: Math.min(1.4, Math.max(0.25, finiteOr(value.zoom, 1))),
  };
}

function parseSavedCanvasViewports(value: unknown): SavedCanvasViewports {
  if (!isRecord(value)) {
    return {};
  }
  const viewports: SavedCanvasViewports = {};
  for (const [key, candidate] of Object.entries(value)) {
    const viewport = parseSavedCanvasViewport(candidate);
    if (viewport) {
      viewports[key] = viewport;
    }
  }
  return viewports;
}

export function readCanvasViewports(
  storage: PreferenceStorage | null = browserStorage(),
): SavedCanvasViewports {
  if (!storage) {
    return {};
  }
  try {
    const raw = storage.getItem(CANVAS_LAYOUTS_KEY);
    return raw === null ? {} : parseSavedCanvasViewports(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function writeCanvasViewport(
  sceneKey: string,
  viewport: SavedCanvasViewport,
  storage: PreferenceStorage | null = browserStorage(),
): SavedCanvasViewports {
  const current = readCanvasViewports(storage);
  const next = {
    ...current,
    [sceneKey]: parseSavedCanvasViewport(viewport) ?? viewport,
  };
  if (storage) {
    try {
      storage.setItem(CANVAS_LAYOUTS_KEY, JSON.stringify(next));
    } catch {
      // Ignore: layout persistence is a convenience, not playback state.
    }
  }
  return next;
}

export function clearCanvasViewports(
  storage: PreferenceStorage | null = browserStorage(),
): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(CANVAS_LAYOUTS_KEY);
  } catch {
    // Ignore: there is nothing safer to do.
  }
}

/** The file-backed scene identity used to key and invalidate a saved layout. */
export function canvasSceneKey(input: {
  tourId: string;
  /** The pinned project revision; a revision change invalidates saved layouts. */
  revision?: string;
  /** Layouts are saved per text scale, not shared across sizes. */
  textScale?: number;
  chapterId: string;
  beatId: string;
  diagramIds: readonly string[];
  containerIds: readonly string[];
}): string {
  return [
    'v1',
    input.tourId,
    input.revision ?? '',
    String(input.textScale ?? 100),
    input.chapterId,
    input.beatId,
    [...input.diagramIds].toSorted().join(','),
    [...input.containerIds].toSorted().join(','),
  ].join('|');
}
