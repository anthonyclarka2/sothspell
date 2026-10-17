import { describe, expect, it } from 'vitest';
import { createMemoryAccountStore, createMemoryRunSyncStore } from './memory-store.js';
import { createSyncService } from './sync-service.js';
import type { OAuthProfile, SyncRun } from './types.js';

const profile: OAuthProfile = {
  githubId: 42,
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: null,
};

function run(overrides: Partial<SyncRun> = {}): SyncRun {
  return {
    tourId: 'tour_bunbun_golden',
    beatId: 'beat_purpose_01',
    offsetMs: 0,
    completedBeatIds: [],
    mode: 'read',
    speed: 1,
    updatedAt: 1000,
    ...overrides,
  };
}

function setup() {
  let now = 5_000;
  const accountStore = createMemoryAccountStore();
  const runStore = createMemoryRunSyncStore();
  const user = accountStore.upsertUserByGithubId(profile, 1);
  const sync = createSyncService({
    accountStore,
    runStore,
    now: () => now,
  });
  return {
    accountStore,
    runStore,
    user,
    sync,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe('SyncService.push', () => {
  it('stores a new run and reports the converged state', () => {
    const { sync, user } = setup();

    const result = sync.push(user.id, [run()]);

    expect(result.results).toEqual([{ tourId: 'tour_bunbun_golden', status: 'stored' }]);
    expect(result.runs).toHaveLength(1);
    expect(result.serverTime).toBe(5_000);
  });

  it('merges an offline push after a remote change and unions completed beats', () => {
    const { sync, user } = setup();
    sync.push(user.id, [
      run({
        beatId: 'beat_remote',
        offsetMs: 900,
        completedBeatIds: ['beat_remote'],
        updatedAt: 2000,
      }),
    ]);

    const result = sync.push(user.id, [
      run({
        beatId: 'beat_local',
        offsetMs: 10,
        completedBeatIds: ['beat_local'],
        updatedAt: 1000,
      }),
    ]);

    expect(result.results).toEqual([{ tourId: 'tour_bunbun_golden', status: 'merged' }]);
    expect(result.runs[0]).toMatchObject({
      beatId: 'beat_remote',
      offsetMs: 900,
      completedBeatIds: ['beat_local', 'beat_remote'],
      updatedAt: 2000,
    });
  });

  it('is idempotent when the same run is pushed twice', () => {
    const { sync, user } = setup();
    const payload = run({ completedBeatIds: ['beat_purpose_01'] });

    const first = sync.push(user.id, [payload]);
    const second = sync.push(user.id, [payload]);

    expect(second.runs).toEqual(first.runs);
  });

  it('does not resurrect a run deleted after the offline write', () => {
    const { sync, user, runStore } = setup();
    runStore.deleteUserRun(user.id, 'tour_bunbun_golden', 2000);

    const result = sync.push(user.id, [run({ updatedAt: 1500 })]);

    expect(result.results).toEqual([{ tourId: 'tour_bunbun_golden', status: 'deleted' }]);
    expect(result.runs).toEqual([]);
    expect(result.tombstones).toEqual([
      { tourId: 'tour_bunbun_golden', deletedAt: 2000 },
    ]);
  });

  it('accepts a run restarted after its tombstone', () => {
    const { sync, user, runStore } = setup();
    runStore.deleteUserRun(user.id, 'tour_bunbun_golden', 2000);

    const result = sync.push(user.id, [run({ beatId: 'beat_restart', updatedAt: 3000 })]);

    expect(result.results).toEqual([{ tourId: 'tour_bunbun_golden', status: 'stored' }]);
    expect(result.runs[0]?.beatId).toBe('beat_restart');
  });

  it('keeps users isolated', () => {
    const { sync, user, accountStore } = setup();
    const other = accountStore.upsertUserByGithubId({ ...profile, githubId: 43 }, 1);

    sync.push(user.id, [run()]);

    expect(sync.pull(other.id).runs).toEqual([]);
  });
});

describe('SyncService.pull', () => {
  it('returns runs newest first with tombstones and server time', () => {
    const { sync, user, runStore } = setup();
    runStore.putUserRun(user.id, run({ tourId: 'tour_one', updatedAt: 1000 }));
    runStore.putUserRun(user.id, run({ tourId: 'tour_two', updatedAt: 3000 }));
    runStore.deleteUserRun(user.id, 'tour_three', 2000);

    const pulled = sync.pull(user.id);

    expect(pulled.runs.map((entry) => entry.tourId)).toEqual(['tour_two', 'tour_one']);
    expect(pulled.tombstones).toEqual([{ tourId: 'tour_three', deletedAt: 2000 }]);
    expect(pulled.serverTime).toBe(5_000);
  });
});

describe('SyncService.claim', () => {
  it('moves anonymous runs into the account and merges with existing progress', () => {
    const { sync, user, runStore } = setup();
    runStore.putUserRun(
      user.id,
      run({ beatId: 'beat_account', completedBeatIds: ['beat_account'], updatedAt: 2000 }),
    );
    runStore.seedAnonymous(
      'client-abcdefgh',
      run({ beatId: 'beat_local', completedBeatIds: ['beat_local'], updatedAt: 1000 }),
    );
    runStore.seedAnonymous(
      'client-abcdefgh',
      run({ tourId: 'tour_other', updatedAt: 1500 }),
    );

    const result = sync.claim(user.id, 'client-abcdefgh');

    expect(result.claimed).toBe(2);
    expect(result.runs).toHaveLength(2);
    expect(runStore.listAnonymousRuns('client-abcdefgh')).toEqual([]);
    const merged = result.runs.find((entry) => entry.tourId === 'tour_bunbun_golden');
    expect(merged).toMatchObject({
      beatId: 'beat_account',
      completedBeatIds: ['beat_account', 'beat_local'],
    });
  });

  it('claims nothing twice and leaves other clients untouched', () => {
    const { sync, user, runStore } = setup();
    runStore.seedAnonymous('client-abcdefgh', run());
    runStore.seedAnonymous('client-otherclient', run({ tourId: 'tour_other' }));

    expect(sync.claim(user.id, 'client-abcdefgh').claimed).toBe(1);
    expect(sync.claim(user.id, 'client-abcdefgh').claimed).toBe(0);
    expect(runStore.listAnonymousRuns('client-otherclient')).toHaveLength(1);
  });
});

describe('SyncService.export and deleteAccount', () => {
  it('exports account, sessions, runs, and tombstones without credentials', () => {
    const { sync, user, accountStore, runStore, advance } = setup();
    accountStore.createSession({
      id: 'session-1',
      userId: user.id,
      createdAt: 1,
      expiresAt: 2,
      userAgent: 'browser',
    });
    runStore.putUserRun(user.id, run());
    advance(100);

    const bundle = sync.export(user.id);

    expect(bundle.exportedAt).toBe(5_100);
    expect(bundle.account).toMatchObject({ login: 'octocat', githubId: 42 });
    expect(bundle.sessions).toEqual([
      {
        id: 'session-1',
        createdAt: 1,
        lastSeenAt: 1,
        expiresAt: 2,
        revokedAt: null,
        userAgent: 'browser',
      },
    ]);
    expect(bundle.runs).toHaveLength(1);
    expect(JSON.stringify(bundle)).not.toContain('token');
  });

  it('deletes runs, tombstones, sessions, and the user', () => {
    const { sync, user, accountStore, runStore } = setup();
    const session = accountStore.createSession({
      id: 'session-1',
      userId: user.id,
      createdAt: 1,
      expiresAt: 2,
      userAgent: null,
    });
    runStore.putUserRun(user.id, run());
    runStore.deleteUserRun(user.id, 'tour_other', 10);

    sync.deleteAccount(user.id);

    expect(accountStore.getUser(user.id)).toBeNull();
    expect(accountStore.getSession(session.id)).toBeNull();
    expect(runStore.listUserRuns(user.id)).toEqual([]);
    expect(runStore.listTombstones(user.id)).toEqual([]);
  });
});
