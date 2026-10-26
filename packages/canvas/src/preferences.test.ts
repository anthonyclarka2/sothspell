import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CANVAS_PREFERENCES,
  parseCanvasPreferences,
  patchCanvasPreferences,
  type CanvasPreferences,
} from './preferences.js';

const VALID: CanvasPreferences = {
  autoZoom: false,
  autoArrange: false,
  followBeat: false,
  motion: 'reduce',
  contrast: 'more',
  palette: 'colorblind',
  textScale: 200,
  seenAutoZoom: true,
  seenAutoArrange: true,
};

function patchUnknown(
  current: CanvasPreferences,
  patch: Record<string, unknown>,
): CanvasPreferences {
  return patchCanvasPreferences(current, patch as Partial<CanvasPreferences>);
}

describe('canvas preference defaults', () => {
  it('enables the optional behaviours and defers accessibility to the system', () => {
    expect(DEFAULT_CANVAS_PREFERENCES).toEqual({
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
});

describe('parseCanvasPreferences', () => {
  it('returns defaults for missing or non-object storage', () => {
    for (const value of [undefined, null, {}, [], 'preferences', 42, true]) {
      expect(parseCanvasPreferences(value)).toEqual(DEFAULT_CANVAS_PREFERENCES);
    }
  });

  it('returns a fresh object rather than the shared default', () => {
    const first = parseCanvasPreferences({});
    const second = parseCanvasPreferences(undefined);

    expect(first).not.toBe(DEFAULT_CANVAS_PREFERENCES);
    expect(second).not.toBe(DEFAULT_CANVAS_PREFERENCES);
    expect(first).not.toBe(second);
  });

  it('keeps a complete valid preference object', () => {
    expect(parseCanvasPreferences(VALID)).toEqual(VALID);
  });

  it('fills a partial object field by field', () => {
    expect(
      parseCanvasPreferences({
        autoZoom: false,
        palette: 'colorblind',
        textScale: 150,
      }),
    ).toEqual({
      ...DEFAULT_CANVAS_PREFERENCES,
      autoZoom: false,
      palette: 'colorblind',
      textScale: 150,
    });
  });

  it('falls back per invalid field without discarding valid neighbours', () => {
    expect(
      parseCanvasPreferences({
        autoZoom: 'yes',
        autoArrange: null,
        followBeat: 1,
        motion: 'less',
        contrast: 'high',
        palette: 'blue',
        textScale: 125,
        seenAutoZoom: 'true',
        seenAutoArrange: 0,
      }),
    ).toEqual({
      ...DEFAULT_CANVAS_PREFERENCES,
      textScale: 125,
    });
  });

  it('accepts only the four supported text scales', () => {
    for (const textScale of [100, 125, 150, 200] as const) {
      expect(parseCanvasPreferences({ textScale }).textScale).toBe(textScale);
    }
    for (const textScale of [0, 99, 175, 300, -100, Number.NaN, '125']) {
      expect(parseCanvasPreferences({ textScale }).textScale).toBe(100);
    }
  });

  it('ignores unknown keys instead of copying them forward', () => {
    const parsed = parseCanvasPreferences({
      ...VALID,
      futurePreference: 'ignored',
      nested: { motion: 'reduce' },
    });

    expect(parsed).toEqual(VALID);
    expect(Object.keys(parsed).toSorted()).toEqual(Object.keys(VALID).toSorted());
  });
});

describe('patchCanvasPreferences', () => {
  it('changes only the patched fields', () => {
    expect(
      patchCanvasPreferences(DEFAULT_CANVAS_PREFERENCES, {
        autoZoom: false,
        motion: 'reduce',
        textScale: 200,
      }),
    ).toEqual({
      ...DEFAULT_CANVAS_PREFERENCES,
      autoZoom: false,
      motion: 'reduce',
      textScale: 200,
    });
  });

  it('does not mutate the current preferences', () => {
    const current = { ...DEFAULT_CANVAS_PREFERENCES };
    const next = patchCanvasPreferences(current, { palette: 'colorblind' });

    expect(next).not.toBe(current);
    expect(current.palette).toBe('default');
    expect(next.palette).toBe('colorblind');
  });

  it('keeps the current value when a patch field is invalid', () => {
    const current: CanvasPreferences = {
      ...DEFAULT_CANVAS_PREFERENCES,
      autoZoom: false,
      textScale: 150,
    };

    expect(
      patchUnknown(current, {
        autoZoom: 'no',
        textScale: 175,
        palette: 'blue',
        seenAutoZoom: 'true',
      }),
    ).toEqual(current);
  });

  it('ignores unknown keys and non-object patches', () => {
    const current = { ...DEFAULT_CANVAS_PREFERENCES, followBeat: false };

    expect(
      patchCanvasPreferences(current, {
        futurePreference: true,
      } as unknown as Partial<CanvasPreferences>),
    ).toEqual(current);
    expect(
      patchCanvasPreferences(current, null as unknown as Partial<CanvasPreferences>),
    ).toEqual(current);
  });
});
