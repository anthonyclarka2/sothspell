import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteAccountStore } from './sqlite-store.js';
import type { OAuthProfile } from './types.js';

const roots: string[] = [];

async function makeDatabasePath(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-accounts-'));
  roots.push(root);
  return path.join(root, 'sothspell.db');
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const profile: OAuthProfile = {
  githubId: 42,
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: 'https://avatars.example/octocat.png',
};

describe('sqlite account store', () => {
  it('persists users across reopen and keeps the account id stable', async () => {
    const databasePath = await makeDatabasePath();

    const first = createSqliteAccountStore(databasePath);
    const user = first.upsertUserByGithubId(profile, 100);
    first.close();

    const reopened = createSqliteAccountStore(databasePath);
    const updated = reopened.upsertUserByGithubId(
      { ...profile, login: 'octocat-renamed' },
      200,
    );

    expect(updated.id).toBe(user.id);
    expect(updated.createdAt).toBe(100);
    expect(updated.updatedAt).toBe(200);
    expect(reopened.getUser(user.id)?.login).toBe('octocat-renamed');
    reopened.close();
  });

  it('stores sessions with expiry, revocation, and touch semantics', async () => {
    const databasePath = await makeDatabasePath();
    const store = createSqliteAccountStore(databasePath);
    const user = store.upsertUserByGithubId(profile, 100);

    store.createSession({
      id: 'session-1',
      userId: user.id,
      createdAt: 100,
      expiresAt: 500,
      userAgent: 'vitest',
    });
    store.touchSession('session-1', 150);

    expect(store.getSession('session-1')).toMatchObject({
      userId: user.id,
      createdAt: 100,
      lastSeenAt: 150,
      expiresAt: 500,
      revokedAt: null,
      userAgent: 'vitest',
    });

    store.revokeSession('session-1', 200);
    expect(store.getSession('session-1')?.revokedAt).toBe(200);

    store.createSession({
      id: 'session-2',
      userId: user.id,
      createdAt: 210,
      expiresAt: 600,
      userAgent: null,
    });
    store.revokeUserSessions(user.id, 220);
    expect(store.getSession('session-2')?.revokedAt).toBe(220);
    expect(store.listSessions(user.id)).toHaveLength(2);
    store.close();
  });

  it('stores device flows and deletes the user with its sessions', async () => {
    const databasePath = await makeDatabasePath();
    const store = createSqliteAccountStore(databasePath);
    const user = store.upsertUserByGithubId(profile, 100);
    store.createDeviceFlow({
      id: 'flow-1',
      deviceCode: 'device-secret',
      intervalSeconds: 5,
      createdAt: 100,
      expiresAt: 1000,
    });
    store.createSession({
      id: 'session-1',
      userId: user.id,
      createdAt: 100,
      expiresAt: 500,
      userAgent: null,
    });

    expect(store.getDeviceFlow('flow-1')?.deviceCode).toBe('device-secret');
    store.updateDeviceFlowInterval('flow-1', 10);
    expect(store.getDeviceFlow('flow-1')?.intervalSeconds).toBe(10);
    store.deleteDeviceFlow('flow-1');
    expect(store.getDeviceFlow('flow-1')).toBeNull();

    store.deleteUser(user.id);
    expect(store.getUser(user.id)).toBeNull();
    expect(store.getSession('session-1')).toBeNull();
    store.close();
  });

  it('is idempotent when opened repeatedly on the same file', async () => {
    const databasePath = await makeDatabasePath();
    let userId = '';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const store = createSqliteAccountStore(databasePath);
      userId = store.upsertUserByGithubId(profile, 100 + attempt).id;
      store.close();
    }

    const store = createSqliteAccountStore(databasePath);
    const user = store.upsertUserByGithubId(profile, 999);
    expect(user.id).toBe(userId);
    expect(user.createdAt).toBe(100);
    expect(user.updatedAt).toBe(999);
    store.close();
  });

  it.runIf(process.platform !== 'win32')(
    'creates the database and its directory owner-only',
    async () => {
      const databasePath = await makeDatabasePath();
      const store = createSqliteAccountStore(databasePath);
      store.upsertUserByGithubId(profile, 100);
      store.close();

      const { stat } = await import('node:fs/promises');
      expect((await stat(databasePath)).mode & 0o777).toBe(0o600);
      expect((await stat(path.dirname(databasePath))).mode & 0o777).toBe(0o700);
    },
  );
});
