import { describe, expect, it } from 'vitest';
import {
  clearEmbedProgress,
  defaultStorage,
  progressStorageKey,
  readEmbedProgress,
  writeEmbedProgress,
  type StorageLike,
  type StoredEmbedProgress,
} from './progress.js';

function memoryStorage(): StorageLike & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

const record: StoredEmbedProgress = {
  tourId: 'tour_1',
  beatId: 'beat_2',
  offsetMs: 4200,
  completedBeatIds: ['beat_1'],
  speed: 1.5,
  updatedAt: 1_700_000_000_000,
};

describe('embed progress storage', () => {
  it('namespaces keys per tour', () => {
    expect(progressStorageKey('tour_1')).toBe('sothspell:embed:tour_1');
  });

  it('round-trips a progress record', () => {
    const storage = memoryStorage();

    writeEmbedProgress(storage, record);

    expect(readEmbedProgress(storage, 'tour_1')).toEqual(record);
  });

  it('reads nothing for another tour', () => {
    const storage = memoryStorage();
    writeEmbedProgress(storage, record);

    expect(readEmbedProgress(storage, 'tour_2')).toBeNull();
  });

  it('ignores corrupt or incomplete records instead of throwing', () => {
    const storage = memoryStorage();
    storage.setItem(progressStorageKey('tour_1'), 'not json');
    expect(readEmbedProgress(storage, 'tour_1')).toBeNull();

    storage.setItem(progressStorageKey('tour_1'), JSON.stringify({ beatId: 'x' }));
    expect(readEmbedProgress(storage, 'tour_1')).toBeNull();
  });

  it('clears a tour record', () => {
    const storage = memoryStorage();
    writeEmbedProgress(storage, record);

    clearEmbedProgress(storage, 'tour_1');

    expect(storage.entries.size).toBe(0);
  });

  it('returns null when no browser storage exists', () => {
    expect(defaultStorage()).toBeNull();
  });
});
