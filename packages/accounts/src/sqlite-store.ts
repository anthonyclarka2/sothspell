import path from 'node:path';
import Database from 'better-sqlite3';
import { ensurePrivateDirectorySync, privatizeFileSync } from '@sothspell/core';
import { randomToken } from './tokens.js';
import type {
  AccountSession,
  AccountStore,
  AccountUser,
  CreateSessionInput,
  DeviceFlow,
  OAuthProfile,
} from './types.js';

interface UserRow {
  id: string;
  github_id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  created_at: number;
  updated_at: number;
}

interface SessionRow {
  id: string;
  user_id: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  revoked_at: number | null;
  user_agent: string | null;
}

interface DeviceFlowRow {
  id: string;
  device_code: string;
  interval_seconds: number;
  created_at: number;
  expires_at: number;
}

function readUser(row: UserRow): AccountUser {
  return {
    id: row.id,
    githubId: row.github_id,
    login: row.login,
    name: row.name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readSession(row: SessionRow): AccountSession {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    userAgent: row.user_agent,
  };
}

function readDeviceFlow(row: DeviceFlowRow): DeviceFlow {
  return {
    id: row.id,
    deviceCode: row.device_code,
    intervalSeconds: row.interval_seconds,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/**
 * The server-side account tables. Migrations are idempotent `CREATE TABLE IF
 * NOT EXISTS` statements so a v1 database upgrades in place on first boot.
 * The store owns no clock: callers pass timestamps, which keeps tests
 * deterministic and expiry auditable.
 */
export function createSqliteAccountStore(databasePath: string): AccountStore {
  if (databasePath !== ':memory:') {
    ensurePrivateDirectorySync(path.dirname(databasePath));
  }
  const database = new Database(databasePath);
  if (databasePath !== ':memory:') {
    privatizeFileSync(databasePath);
  }
  database.pragma('journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      github_id INTEGER NOT NULL UNIQUE,
      login TEXT NOT NULL,
      name TEXT,
      avatar_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS device_flows (
      id TEXT PRIMARY KEY,
      device_code TEXT NOT NULL,
      interval_seconds INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);

  const upsertUser = database.prepare(`
    INSERT INTO users (id, github_id, login, name, avatar_url, created_at, updated_at)
    VALUES (@id, @githubId, @login, @name, @avatarUrl, @now, @now)
    ON CONFLICT(github_id) DO UPDATE SET
      login = excluded.login,
      name = excluded.name,
      avatar_url = excluded.avatar_url,
      updated_at = excluded.updated_at
  `);
  const selectUserById = database.prepare('SELECT * FROM users WHERE id = ?');
  const selectUserByGithubId = database.prepare(
    'SELECT * FROM users WHERE github_id = ?',
  );
  const insertSession = database.prepare(`
    INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, revoked_at, user_agent)
    VALUES (@id, @userId, @createdAt, @createdAt, @expiresAt, NULL, @userAgent)
  `);
  const selectSession = database.prepare('SELECT * FROM sessions WHERE id = ?');
  const touchSession = database.prepare(
    'UPDATE sessions SET last_seen_at = ? WHERE id = ?',
  );
  const revokeSession = database.prepare(
    'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
  );
  const revokeUserSessions = database.prepare(
    'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
  );
  const listSessions = database.prepare(
    'SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC',
  );
  const deleteSessionsForUser = database.prepare(
    'DELETE FROM sessions WHERE user_id = ?',
  );
  const deleteUser = database.prepare('DELETE FROM users WHERE id = ?');
  const insertDeviceFlow = database.prepare(`
    INSERT INTO device_flows (id, device_code, interval_seconds, created_at, expires_at)
    VALUES (@id, @deviceCode, @intervalSeconds, @createdAt, @expiresAt)
  `);
  const selectDeviceFlow = database.prepare('SELECT * FROM device_flows WHERE id = ?');
  const updateDeviceFlow = database.prepare(
    'UPDATE device_flows SET interval_seconds = ? WHERE id = ?',
  );
  const deleteDeviceFlow = database.prepare('DELETE FROM device_flows WHERE id = ?');

  return {
    upsertUserByGithubId(profile: OAuthProfile, now: number) {
      upsertUser.run({
        id: `user_${randomToken(12)}`,
        githubId: profile.githubId,
        login: profile.login,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        now,
      });
      const row = selectUserByGithubId.get(profile.githubId) as UserRow | undefined;
      if (!row) {
        throw new Error('the user upsert did not produce a row');
      }
      return readUser(row);
    },

    getUser(userId) {
      const row = selectUserById.get(userId) as UserRow | undefined;
      return row ? readUser(row) : null;
    },

    createSession(input: CreateSessionInput) {
      insertSession.run({
        id: input.id,
        userId: input.userId,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
        userAgent: input.userAgent,
      });
      const row = selectSession.get(input.id) as SessionRow | undefined;
      if (!row) {
        throw new Error('the session insert did not produce a row');
      }
      return readSession(row);
    },

    getSession(sessionId) {
      const row = selectSession.get(sessionId) as SessionRow | undefined;
      return row ? readSession(row) : null;
    },

    touchSession(sessionId, at) {
      touchSession.run(at, sessionId);
    },

    revokeSession(sessionId, at) {
      revokeSession.run(at, sessionId);
    },

    revokeUserSessions(userId, at) {
      revokeUserSessions.run(at, userId);
    },

    listSessions(userId) {
      return (listSessions.all(userId) as SessionRow[]).map(readSession);
    },

    deleteUser(userId) {
      deleteSessionsForUser.run(userId);
      deleteUser.run(userId);
    },

    createDeviceFlow(flow) {
      insertDeviceFlow.run({
        id: flow.id,
        deviceCode: flow.deviceCode,
        intervalSeconds: flow.intervalSeconds,
        createdAt: flow.createdAt,
        expiresAt: flow.expiresAt,
      });
    },

    getDeviceFlow(flowId) {
      const row = selectDeviceFlow.get(flowId) as DeviceFlowRow | undefined;
      return row ? readDeviceFlow(row) : null;
    },

    updateDeviceFlowInterval(flowId, intervalSeconds) {
      updateDeviceFlow.run(intervalSeconds, flowId);
    },

    deleteDeviceFlow(flowId) {
      deleteDeviceFlow.run(flowId);
    },

    close() {
      database.close();
    },
  };
}
