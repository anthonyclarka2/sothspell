import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  createMemoryAccountStore,
  createMemoryRunSyncStore,
  createSyncService,
  type OAuthProfile,
} from '@sothspell/accounts';
import { createAuthRuntime } from './auth.js';
import { registerAccountRoutes } from './accounts.js';

const profile: OAuthProfile = {
  githubId: 7,
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: null,
};

function runPayload(overrides: Record<string, unknown> = {}) {
  return {
    tourId: 'tour_bunbun_golden',
    beatId: 'beat_purpose_01',
    offsetMs: 1200,
    completedBeatIds: ['beat_purpose_01'],
    mode: 'read',
    speed: 1,
    updatedAt: 2000,
    ...overrides,
  };
}

function makeApp() {
  const accountStore = createMemoryAccountStore();
  const runStore = createMemoryRunSyncStore();
  const user = accountStore.upsertUserByGithubId(profile, 1);
  const runtime = createAuthRuntime({
    accountStore,
    sessionSecret: 'test-session-secret',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    publicUrl: 'http://127.0.0.1:4319',
    fetchImpl: async () => new Response('{}', { status: 500 }),
    now: () => 5000,
  });
  const sync = createSyncService({ accountStore, runStore, now: () => 5000 });
  const app = new Hono();
  registerAccountRoutes(app, { auth: runtime, sync });

  const { session, token } = runtime.sessions.signIn(user.id, { userAgent: 'vitest' });
  const authorized = { authorization: `Bearer ${token}` };
  const cookie = { cookie: `sothspell_session=${token}` };
  return {
    app,
    runtime,
    accountStore,
    runStore,
    sync,
    user,
    session,
    token,
    authorized,
    cookie,
  };
}

describe('account routes', () => {
  it('requires a session for every account and sync route', async () => {
    const { app } = makeApp();
    const requests: Array<[string, string]> = [
      ['GET', '/api/account'],
      ['GET', '/api/account/export'],
      ['DELETE', '/api/account'],
      ['POST', '/api/sync/pull'],
      ['POST', '/api/sync/push'],
      ['POST', '/api/sync/claim'],
    ];
    for (const [method, path] of requests) {
      const response = await app.request(path, { method });
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });

  it('returns the user and the device session list', async () => {
    const { app, authorized, session } = makeApp();

    const response = await app.request('/api/account', { headers: authorized });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: {
        id: expect.any(String),
        login: 'octocat',
        name: 'The Octocat',
        avatarUrl: null,
      },
      sessions: [
        {
          id: session.id,
          createdAt: 5000,
          lastSeenAt: 5000,
          expiresAt: expect.any(Number),
          userAgent: 'vitest',
        },
      ],
    });
  });

  it('lists only live sessions for the device list', async () => {
    const { app, authorized, accountStore, user } = makeApp();
    const revoked = accountStore.createSession({
      id: 'session_revoked',
      userId: user.id,
      createdAt: 1,
      expiresAt: 9_999_999,
      userAgent: 'old-device',
    });
    accountStore.revokeSession(revoked.id, 2);
    const expired = accountStore.createSession({
      id: 'session_expired',
      userId: user.id,
      createdAt: 1,
      expiresAt: 100,
      userAgent: 'stale-device',
    });

    const response = await app.request('/api/account', { headers: authorized });
    const body = (await response.json()) as { sessions: Array<{ id: string }> };

    expect(body.sessions.map((session) => session.id)).not.toContain(revoked.id);
    expect(body.sessions.map((session) => session.id)).not.toContain(expired.id);
    expect(body.sessions).toHaveLength(1);
  });

  it('exports the account bundle as a download without credentials', async () => {
    const { app, authorized, runStore, user } = makeApp();
    runStore.putUserRun(user.id, {
      tourId: 'tour_bunbun_golden',
      beatId: 'beat_purpose_01',
      offsetMs: 0,
      completedBeatIds: [],
      mode: 'read',
      speed: 1,
      updatedAt: 1000,
    });

    const response = await app.request('/api/account/export', { headers: authorized });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('attachment');
    const body = await response.json();
    expect(body).toMatchObject({
      exportedAt: 5000,
      account: { login: 'octocat', githubId: 7 },
      runs: [expect.objectContaining({ tourId: 'tour_bunbun_golden' })],
    });
    expect(JSON.stringify(body)).not.toContain('token');
  });

  it('deletes the account, its runs, and revokes sessions', async () => {
    const { app, authorized, accountStore, runStore, user, token } = makeApp();
    runStore.putUserRun(user.id, {
      tourId: 'tour_bunbun_golden',
      beatId: 'beat_purpose_01',
      offsetMs: 0,
      completedBeatIds: [],
      mode: 'read',
      speed: 1,
      updatedAt: 1000,
    });

    const response = await app.request('/api/account', {
      method: 'DELETE',
      headers: { origin: 'http://127.0.0.1:5173', ...authorized },
    });

    expect(response.status).toBe(200);
    expect(
      response.headers
        .getSetCookie()
        .find((header) => header.startsWith('sothspell_session=')),
    ).toContain('Max-Age=0');
    expect(accountStore.getUser(user.id)).toBeNull();
    expect(runStore.listUserRuns(user.id)).toEqual([]);
    expect(accountStore.getSession(token.split('.')[0] ?? '')).toBeNull();
    const after = await app.request('/api/account', { headers: authorized });
    expect(after.status).toBe(401);
  });

  it('rejects state-changing requests from an untrusted origin', async () => {
    const { app, authorized } = makeApp();
    const evil = { origin: 'https://evil.example', ...authorized };

    expect(
      (await app.request('/api/sync/pull', { method: 'POST', headers: evil })).status,
    ).toBe(403);
    expect(
      (
        await app.request('/api/sync/push', {
          method: 'POST',
          headers: evil,
          body: JSON.stringify({ runs: [] }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request('/api/sync/claim', {
          method: 'POST',
          headers: evil,
          body: JSON.stringify({ clientId: 'client-abcdefgh' }),
        })
      ).status,
    ).toBe(403);
    expect(
      (await app.request('/api/account', { method: 'DELETE', headers: evil })).status,
    ).toBe(403);
  });
});

describe('sync routes', () => {
  it('pushes and pulls runs with the merge rules applied', async () => {
    const { app, authorized } = makeApp();

    const push = await app.request('/api/sync/push', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:4319', ...authorized },
      body: JSON.stringify({
        runs: [runPayload({ completedBeatIds: ['beat_a'], updatedAt: 1000 })],
      }),
    });
    expect(push.status).toBe(200);
    await expect(push.json()).resolves.toMatchObject({
      results: [{ tourId: 'tour_bunbun_golden', status: 'stored' }],
      runs: [expect.objectContaining({ completedBeatIds: ['beat_a'] })],
    });

    // A remote device advances the position; an older offline push must not win.
    await app.request('/api/sync/push', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:4319', ...authorized },
      body: JSON.stringify({
        runs: [
          runPayload({
            beatId: 'beat_remote',
            offsetMs: 5,
            mode: 'listen',
            speed: 1.5,
            completedBeatIds: ['beat_remote'],
            updatedAt: 3000,
          }),
        ],
      }),
    });
    const stalePush = await app.request('/api/sync/push', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:4319', ...authorized },
      body: JSON.stringify({
        runs: [runPayload({ completedBeatIds: ['beat_b'], updatedAt: 2000 })],
      }),
    });
    await expect(stalePush.json()).resolves.toMatchObject({
      results: [{ tourId: 'tour_bunbun_golden', status: 'merged' }],
      runs: [
        expect.objectContaining({
          beatId: 'beat_remote',
          offsetMs: 5,
          completedBeatIds: ['beat_a', 'beat_b', 'beat_remote'],
        }),
      ],
    });

    const pull = await app.request('/api/sync/pull', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:4319', ...authorized },
    });
    expect(pull.status).toBe(200);
    const pulled = (await pull.json()) as {
      runs: Array<{ beatId: string }>;
      tombstones: unknown[];
      serverTime: number;
    };
    expect(pulled.runs[0]?.beatId).toBe('beat_remote');
    expect(pulled.tombstones).toEqual([]);
    expect(pulled.serverTime).toBe(5000);
  });

  it('reports a tombstoned run as deleted instead of resurrecting it', async () => {
    const { app, authorized, runStore, user } = makeApp();
    runStore.deleteUserRun(user.id, 'tour_bunbun_golden', 3000);

    const response = await app.request('/api/sync/push', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:4319', ...authorized },
      body: JSON.stringify({ runs: [runPayload({ updatedAt: 2000 })] }),
    });

    await expect(response.json()).resolves.toMatchObject({
      results: [{ tourId: 'tour_bunbun_golden', status: 'deleted' }],
      runs: [],
      tombstones: [{ tourId: 'tour_bunbun_golden', deletedAt: 3000 }],
    });
  });

  it('claims anonymous runs for the signed-in user', async () => {
    const { app, authorized, runStore } = makeApp();
    runStore.seedAnonymous('client-abcdefgh', {
      tourId: 'tour_bunbun_golden',
      beatId: 'beat_local',
      offsetMs: 100,
      completedBeatIds: ['beat_local'],
      mode: 'read',
      speed: 1,
      updatedAt: 1000,
    });

    const response = await app.request('/api/sync/claim', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:4319', ...authorized },
      body: JSON.stringify({ clientId: 'client-abcdefgh' }),
    });

    await expect(response.json()).resolves.toMatchObject({
      claimed: 1,
      runs: [expect.objectContaining({ beatId: 'beat_local' })],
    });
    expect(runStore.listAnonymousRuns('client-abcdefgh')).toEqual([]);
  });

  it('rejects invalid sync and claim payloads', async () => {
    const { app, authorized } = makeApp();

    const badPush = await app.request('/api/sync/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authorized },
      body: JSON.stringify({ runs: [{ tourId: '' }] }),
    });
    expect(badPush.status).toBe(400);

    const badClaim = await app.request('/api/sync/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authorized },
      body: JSON.stringify({ clientId: 'short' }),
    });
    expect(badClaim.status).toBe(400);
  });
});
