import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_LAYOUTS_KEY,
  CANVAS_PREFERENCES_KEY,
  DEFAULT_CANVAS_PREFERENCES,
  canvasSceneKey,
  clearCanvasViewports,
  createCanvasPreferenceStore,
  parseCanvasPreferences,
  readCanvasPreferences,
  readCanvasViewports,
  resetCanvasPreferences,
  writeCanvasPreferences,
  writeCanvasViewport,
  type PreferenceStorage,
} from './canvas-preferences.js';

/** A structural localStorage stand-in; the module never needs a DOM. */
class FakeStorage implements PreferenceStorage {
  readonly values = new Map<string, string>();
  writes = 0;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('canvas preferences', () => {
  it('uses safe defaults when nothing is stored', () => {
    const storage = new FakeStorage();

    expect(readCanvasPreferences(storage)).toEqual(DEFAULT_CANVAS_PREFERENCES);
    expect(DEFAULT_CANVAS_PREFERENCES).toMatchObject({
      autoZoom: true,
      autoArrange: true,
      followBeat: true,
      motion: 'system',
      contrast: 'system',
      palette: 'default',
      textScale: 100,
      seenAutoZoom: false,
      seenAutoArrange: false,
    });
  });

  it('persists and reads the versioned key', () => {
    const storage = new FakeStorage();
    const next = writeCanvasPreferences(
      {
        ...DEFAULT_CANVAS_PREFERENCES,
        motion: 'reduce',
        contrast: 'more',
        palette: 'colorblind',
        textScale: 200,
        autoZoom: false,
      },
      storage,
    );

    expect(next.textScale).toBe(200);
    expect(storage.values.has(CANVAS_PREFERENCES_KEY)).toBe(true);
    expect(readCanvasPreferences(storage)).toMatchObject({
      motion: 'reduce',
      contrast: 'more',
      palette: 'colorblind',
      textScale: 200,
      autoZoom: false,
    });
  });

  it('falls back per field for invalid stored values', () => {
    const storage = new FakeStorage();
    storage.setItem(
      CANVAS_PREFERENCES_KEY,
      JSON.stringify({
        autoZoom: 'yes',
        autoArrange: false,
        followBeat: 1,
        motion: 'warp',
        contrast: 'less',
        palette: 'neon',
        textScale: 300,
        seenAutoZoom: 'seen',
      }),
    );

    expect(readCanvasPreferences(storage)).toEqual({
      ...DEFAULT_CANVAS_PREFERENCES,
      autoArrange: false,
    });
  });

  it('survives unreadable JSON and invalid shapes', () => {
    const storage = new FakeStorage();
    storage.setItem(CANVAS_PREFERENCES_KEY, '{not json');

    expect(readCanvasPreferences(storage)).toEqual(DEFAULT_CANVAS_PREFERENCES);
    expect(parseCanvasPreferences(null)).toEqual(DEFAULT_CANVAS_PREFERENCES);
    expect(parseCanvasPreferences([1, 2, 3])).toEqual(DEFAULT_CANVAS_PREFERENCES);
  });

  it('resets by removing the stored key and returning defaults', () => {
    const storage = new FakeStorage();
    writeCanvasPreferences({ ...DEFAULT_CANVAS_PREFERENCES, textScale: 150 }, storage);

    expect(resetCanvasPreferences(storage)).toEqual(DEFAULT_CANVAS_PREFERENCES);
    expect(storage.values.has(CANVAS_PREFERENCES_KEY)).toBe(false);
  });

  it('notifies subscribers and serves the same value to the display menu', () => {
    const storage = new FakeStorage();
    const store = createCanvasPreferenceStore({ storage });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.update({ palette: 'colorblind', seenAutoZoom: true });

    expect(store.get()).toMatchObject({
      palette: 'colorblind',
      seenAutoZoom: true,
    });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ palette: 'colorblind', seenAutoZoom: true }),
    );

    unsubscribe();
    store.update({ palette: 'default' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps working in memory when storage throws', () => {
    const storage: PreferenceStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };

    expect(readCanvasPreferences(storage)).toEqual(DEFAULT_CANVAS_PREFERENCES);
    expect(
      writeCanvasPreferences({ ...DEFAULT_CANVAS_PREFERENCES, contrast: 'more' }, storage)
        .contrast,
    ).toBe('more');
    expect(resetCanvasPreferences(storage)).toEqual(DEFAULT_CANVAS_PREFERENCES);
  });
});

describe('canvas saved viewports', () => {
  it('stores one viewport per scene and clamps invalid zoom values', () => {
    const storage = new FakeStorage();
    const scene = canvasSceneKey({
      tourId: 'tour',
      chapterId: 'chapter',
      beatId: 'beat',
      diagramIds: ['b', 'a'],
      containerIds: ['code'],
    });

    writeCanvasViewport(scene, { x: 10, y: 20, zoom: 9 }, storage);

    expect(readCanvasViewports(storage)[scene]).toEqual({ x: 10, y: 20, zoom: 1.4 });
    expect(storage.values.has(CANVAS_LAYOUTS_KEY)).toBe(true);
  });

  it('ignores malformed records and clears all saved layouts', () => {
    const storage = new FakeStorage();
    storage.setItem(
      CANVAS_LAYOUTS_KEY,
      JSON.stringify({ valid: { x: 1, y: 2, zoom: 1 } }),
    );
    writeCanvasViewport('second', { x: 0, y: 0, zoom: 1 }, storage);
    storage.setItem(CANVAS_LAYOUTS_KEY, '{broken');

    expect(readCanvasViewports(storage)).toEqual({});
    clearCanvasViewports(storage);
    expect(storage.values.has(CANVAS_LAYOUTS_KEY)).toBe(false);
  });

  it('builds a stable scene key independent of diagram and container order', () => {
    const input = {
      tourId: 'tour',
      revision: 'abc123',
      chapterId: 'chapter',
      beatId: 'beat',
      diagramIds: ['diagram_a', 'diagram_b'],
      containerIds: ['code_a', 'code_b'],
    };

    expect(canvasSceneKey(input)).toBe(
      canvasSceneKey({
        ...input,
        diagramIds: ['diagram_b', 'diagram_a'],
        containerIds: ['code_b', 'code_a'],
      }),
    );
    expect(canvasSceneKey(input)).not.toBe(
      canvasSceneKey({ ...input, beatId: 'other_beat' }),
    );
    expect(canvasSceneKey(input)).not.toBe(
      canvasSceneKey({ ...input, revision: 'def456' }),
    );
    expect(canvasSceneKey(input)).not.toBe(canvasSceneKey({ ...input, textScale: 200 }));
  });
});
