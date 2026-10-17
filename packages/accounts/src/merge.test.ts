import { describe, expect, it } from 'vitest';
import {
  mergeRunCollections,
  mergeSyncRun,
  tombstoneWins,
  unionCompletedBeatIds,
} from './merge.js';
import type { SyncRun } from './types.js';

function run(overrides: Partial<SyncRun> = {}): SyncRun {
  return {
    tourId: 'tour_bunbun_golden',
    beatId: 'beat_purpose_01',
    offsetMs: 1200,
    completedBeatIds: [],
    mode: 'read',
    speed: 1,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('mergeSyncRun', () => {
  it('takes the position from the newer run as one coherent pair', () => {
    const local = run({
      beatId: 'beat_purpose_01',
      offsetMs: 1200,
      updatedAt: 1000,
    });
    const remote = run({
      beatId: 'beat_purpose_04',
      offsetMs: 30,
      mode: 'listen',
      speed: 1.25,
      updatedAt: 2000,
    });

    const merged = mergeSyncRun(local, remote);

    expect(merged).toMatchObject({
      beatId: 'beat_purpose_04',
      offsetMs: 30,
      mode: 'listen',
      speed: 1.25,
      updatedAt: 2000,
    });
  });

  it('never mixes the newer beat with the older offset', () => {
    const older = run({ beatId: 'beat_old', offsetMs: 5000, updatedAt: 1000 });
    const newer = run({ beatId: 'beat_new', offsetMs: 10, updatedAt: 2000 });

    const merged = mergeSyncRun(newer, older);

    expect(merged.beatId).toBe('beat_new');
    expect(merged.offsetMs).toBe(10);
  });

  it('unions completed beats regardless of which side is newer', () => {
    const local = run({ completedBeatIds: ['beat_a', 'beat_b'], updatedAt: 2000 });
    const remote = run({ completedBeatIds: ['beat_b', 'beat_c'], updatedAt: 1000 });

    const merged = mergeSyncRun(local, remote);

    expect(merged.completedBeatIds).toEqual(['beat_a', 'beat_b', 'beat_c']);
  });

  it('prefers the left side on equal timestamps so a repeated push is idempotent', () => {
    const stored = run({ beatId: 'beat_stored', updatedAt: 1500 });
    const incoming = run({ beatId: 'beat_incoming', updatedAt: 1500 });

    expect(mergeSyncRun(stored, incoming).beatId).toBe('beat_stored');
    expect(mergeSyncRun(stored, incoming)).toEqual(
      mergeSyncRun(mergeSyncRun(stored, incoming), incoming),
    );
  });

  it('sorts the completed beat union deterministically', () => {
    expect(unionCompletedBeatIds(['b', 'a'], ['c', 'a'])).toEqual(['a', 'b', 'c']);
  });
});

describe('mergeRunCollections', () => {
  it('merges local and remote runs and keeps the newest position per tour', () => {
    const merged = mergeRunCollections(
      [run({ tourId: 'tour_one', beatId: 'beat_local', updatedAt: 1000 })],
      [run({ tourId: 'tour_one', beatId: 'beat_remote', updatedAt: 2000 })],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.beatId).toBe('beat_remote');
  });

  it('drops runs a tombstone already deleted', () => {
    const merged = mergeRunCollections(
      [run({ tourId: 'tour_deleted', updatedAt: 1000 })],
      [],
      [{ tourId: 'tour_deleted', deletedAt: 1500 }],
    );

    expect(merged).toEqual([]);
  });

  it('keeps a run restarted after its tombstone', () => {
    const merged = mergeRunCollections(
      [run({ tourId: 'tour_restarted', beatId: 'beat_new', updatedAt: 3000 })],
      [],
      [{ tourId: 'tour_restarted', deletedAt: 1500 }],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.beatId).toBe('beat_new');
  });
});

describe('tombstoneWins', () => {
  it('treats a deletion at the same timestamp as the write as final', () => {
    expect(tombstoneWins({ tourId: 'tour', deletedAt: 1000 }, run({ updatedAt: 1000 }))).toBe(
      true,
    );
    expect(tombstoneWins({ tourId: 'tour', deletedAt: 999 }, run({ updatedAt: 1000 }))).toBe(
      false,
    );
  });
});
