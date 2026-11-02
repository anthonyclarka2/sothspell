import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYER_VIEW,
  parsePlayerView,
  resolvePlayerView,
} from './player-view.js';

describe('player view', () => {
  it('defaults to the canvas view', () => {
    expect(DEFAULT_PLAYER_VIEW).toBe('canvas');
    expect(resolvePlayerView({})).toBe('canvas');
    expect(resolvePlayerView({ view: undefined })).toBe('canvas');
  });

  it('accepts the explicit canvas and stage values', () => {
    expect(parsePlayerView('canvas')).toBe('canvas');
    expect(parsePlayerView('stage')).toBe('stage');
    expect(resolvePlayerView({ view: 'canvas' })).toBe('canvas');
    expect(resolvePlayerView({ view: 'stage' })).toBe('stage');
  });

  it('ignores unknown or malformed values and falls back to canvas', () => {
    for (const value of [null, '', 'Stage', 'screen', 1, false, {}]) {
      expect(parsePlayerView(value)).toBeUndefined();
      expect(resolvePlayerView({ view: value })).toBe('canvas');
    }
  });
});
