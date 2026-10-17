import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createRunStore, type RunRecord } from './runs.js';

const roots: string[] = [];

async function makeDatabasePath(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-runs-'));
  roots.push(root);
  return path.join(root, 'sothspell.db');
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function anonymousRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    clientId: 'client-abcdefgh',
    tourId: 'tour_bunbun_golden',
    beatId: 'beat_purpose_01',
    offsetMs: 1200,
    completedBeatIds: ['beat_purpose_01'],
    mode: 'read',
    speed: 1,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('run store migrations', () => {
  it('upgrades a v1 anonymous database in place and keeps its rows readable', async () => {
    const databasePath = await makeDatabasePath();
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE runs (
        client_id TEXT NOT NULL,
        tour_id TEXT NOT NULL,
        beat_id TEXT NOT NULL,
        offset_ms INTEGER NOT NULL,
        completed TEXT NOT NULL,
        mode TEXT NOT NULL,
        speed REAL NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (client_id, tour_id)
      );
    `);
    legacy
      .prepare(
        `INSERT INTO runs (client_id, tour_id, beat_id, offset_ms, completed, mode, speed, updated_at)
         VALUES ('client-legacy12', 'tour_bunbun_golden', 'beat_purpose_02', 50, '["beat_purpose_01"]', 'listen', 1.25, 900)`,
      )
      .run();
    legacy.close();

    const store = createRunStore(databasePath);
    expect(store.get('client-legacy12', 'tour_bunbun_golden')).toMatchObject({
      beatId: 'beat_purpose_02',
      mode: 'listen',
      speed: 1.25,
    });

    store.putUserRun('user_1', {
      tourId: 'tour_bunbun_golden',
      beatId: 'beat_purpose_03',
      offsetMs: 10,
      completedBeatIds: [],
      mode: 'read',
      speed: 1,
      updatedAt: 2000,
    });
    expect(store.getUserRun('user_1', 'tour_bunbun_golden')?.beatId).toBe(
      'beat_purpose_03',
    );
    store.close();

    const reopened = createRunStore(databasePath);
    expect(reopened.get('client-legacy12', 'tour_bunbun_golden')?.beatId).toBe(
      'beat_purpose_02',
    );
    expect(reopened.getUserRun('user_1', 'tour_bunbun_golden')?.beatId).toBe(
      'beat_purpose_03',
    );
    reopened.close();
  });
});

describe('user-scoped runs', () => {
  it('stores one row per user and tour and lists newest first', () => {
    const store = createRunStore(':memory:');

    store.putUserRun('user_1', {
      tourId: 'tour_one',
      beatId: 'beat_a',
      offsetMs: 0,
      completedBeatIds: [],
      mode: 'read',
      speed: 1,
      updatedAt: 1000,
    });
    store.putUserRun('user_1', {
      tourId: 'tour_two',
      beatId: 'beat_b',
      offsetMs: 5,
      completedBeatIds: ['beat_a'],
      mode: 'listen',
      speed: 1.5,
      updatedAt: 2000,
    });
    store.putUserRun('user_2', {
      tourId: 'tour_one',
      beatId: 'beat_other',
      offsetMs: 1,
      completedBeatIds: [],
      mode: 'read',
      speed: 1,
      updatedAt: 1500,
    });

    expect(store.listUserRuns('user_1').map((run) => run.tourId)).toEqual([
      'tour_two',
      'tour_one',
    ]);
    expect(store.listUserRuns('user_1')[0]).toMatchObject({
      completedBeatIds: ['beat_a'],
      mode: 'listen',
    });
    expect(store.listUserRuns('user_2')).toHaveLength(1);
    store.close();
  });

  it('keeps user rows out of anonymous reads and vice versa', () => {
    const store = createRunStore(':memory:');
    store.put('tour_bunbun_golden', anonymousRun());
    store.putUserRun('user_1', {
      tourId: 'tour_bunbun_golden',
      beatId: 'beat_account',
      offsetMs: 0,
      completedBeatIds: [],
      mode: 'read',
      speed: 1,
      updatedAt: 2000,
    });

    expect(store.list('client-abcdefgh')).toHaveLength(1);
    expect(store.list('client-abcdefgh')[0]?.beatId).toBe('beat_purpose_01');
    expect(store.listAnonymousRuns('client-abcdefgh')).toHaveLength(1);
    expect(store.listUserRuns('user_1')).toHaveLength(1);
    expect(store.getUserRun('user_1', 'tour_bunbun_golden')?.beatId).toBe('beat_account');
    // User rows use a sentinel client id but are never visible as anonymous runs.
    expect(store.listAnonymousRuns('user:user_1')).toEqual([]);
    store.close();
  });

  it('deletes a user run with a tombstone and does not resurrect it', () => {
    const store = createRunStore(':memory:');
    store.putUserRun('user_1', {
      tourId: 'tour_bunbun_golden',
      beatId: 'beat_a',
      offsetMs: 0,
      completedBeatIds: [],
      mode: 'read',
      speed: 1,
      updatedAt: 1000,
    });

    store.deleteUserRun('user_1', 'tour_bunbun_golden', 1500);

    expect(store.getUserRun('user_1', 'tour_bunbun_golden')).toBeNull();
    expect(store.listTombstones('user_1')).toEqual([
      { tourId: 'tour_bunbun_golden', deletedAt: 1500 },
    ]);
    store.close();
  });

  it('removes only anonymous rows when a claim migrates them', () => {
    const store = createRunStore(':memory:');
    store.put('tour_one', anonymousRun({ tourId: 'tour_one' }));
    store.put('tour_two', anonymousRun({ tourId: 'tour_two' }));
    store.put(
      'tour_other',
      anonymousRun({ clientId: 'client-otherclient', tourId: 'tour_one' }),
    );

    store.removeAnonymousRuns('client-abcdefgh');

    expect(store.listAnonymousRuns('client-abcdefgh')).toEqual([]);
    expect(store.listAnonymousRuns('client-otherclient')).toHaveLength(1);
    store.close();
  });

  it('deletes all user runs and tombstones without touching anonymous rows', () => {
    const store = createRunStore(':memory:');
    store.put('tour_one', anonymousRun({ tourId: 'tour_one' }));
    store.putUserRun('user_1', {
      tourId: 'tour_one',
      beatId: 'beat_a',
      offsetMs: 0,
      completedBeatIds: [],
      mode: 'read',
      speed: 1,
      updatedAt: 1000,
    });
    store.deleteUserRun('user_1', 'tour_two', 1500);

    store.deleteUserRuns('user_1');

    expect(store.listUserRuns('user_1')).toEqual([]);
    expect(store.listTombstones('user_1')).toEqual([]);
    expect(store.listAnonymousRuns('client-abcdefgh')).toHaveLength(1);
    store.close();
  });
});
