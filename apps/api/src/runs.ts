import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { RunSyncStore, RunTombstone, SyncRun } from '@sothspell/accounts';

export const RunBodySchema = z.object({
  clientId: z.string().min(8).max(128),
  beatId: z.string().min(1).max(128),
  offsetMs: z.number().int().min(0).max(3_600_000),
  completedBeatIds: z.array(z.string().min(1).max(128)).max(500),
  mode: z.enum(['read', 'listen', 'explore']),
  speed: z.number().min(0.5).max(3),
  /**
   * Optional writer timestamp. The player omits it (the server stamps "now"),
   * but a CLI pull preserves the account's updatedAt so merge order survives.
   */
  updatedAt: z.number().int().min(0).optional(),
});

export type RunBody = z.infer<typeof RunBodySchema>;

export interface RunRecord extends RunBody {
  tourId: string;
  updatedAt: number;
}

interface RunRow {
  client_id: string;
  tour_id: string;
  beat_id: string;
  offset_ms: number;
  completed: string;
  mode: string;
  speed: number;
  updated_at: number;
  user_id: string | null;
}

interface TombstoneRow {
  user_id: string;
  tour_id: string;
  deleted_at: number;
}

function readRow(row: RunRow): RunRecord {
  return {
    clientId: row.client_id,
    tourId: row.tour_id,
    beatId: row.beat_id,
    offsetMs: row.offset_ms,
    completedBeatIds: JSON.parse(row.completed) as string[],
    mode: row.mode as RunRecord['mode'],
    speed: row.speed,
    updatedAt: row.updated_at,
  };
}

/** The user scope carries no client identity; sync never sees one. */
function readSyncRow(row: RunRow): SyncRun {
  return {
    tourId: row.tour_id,
    beatId: row.beat_id,
    offsetMs: row.offset_ms,
    completedBeatIds: JSON.parse(row.completed) as string[],
    mode: row.mode as SyncRun['mode'],
    speed: row.speed,
    updatedAt: row.updated_at,
  };
}

/**
 * User-scoped rows reuse the v1 `(client_id, tour_id)` primary key. This
 * sentinel client id keeps exactly one row per user per tour no matter which
 * device wrote it, while anonymous queries (which use real client ids) never
 * see account rows.
 */
export function userClientId(userId: string): string {
  return `user:${userId}`;
}

export interface RunStore extends RunSyncStore {
  get(clientId: string, tourId: string): RunRecord | null;
  put(tourId: string, record: RunRecord): RunRecord;
  list(clientId: string): RunRecord[];
  remove(clientId: string, tourId: string): void;
  close(): void;
}

/**
 * The local run store. Anonymous progress is keyed by the client id generated
 * in the browser. Phase 12 adds a nullable user scope: claimed and synced runs
 * carry `user_id`, and deletions leave tombstones so a stale device cannot
 * resurrect them.
 */
export function createRunStore(databasePath: string): RunStore {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const database = new Database(databasePath);
  database.pragma('journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      client_id TEXT NOT NULL,
      tour_id TEXT NOT NULL,
      beat_id TEXT NOT NULL,
      offset_ms INTEGER NOT NULL,
      completed TEXT NOT NULL,
      mode TEXT NOT NULL,
      speed REAL NOT NULL,
      updated_at INTEGER NOT NULL,
      user_id TEXT,
      PRIMARY KEY (client_id, tour_id)
    );

    CREATE TABLE IF NOT EXISTS run_tombstones (
      user_id TEXT NOT NULL,
      tour_id TEXT NOT NULL,
      deleted_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, tour_id)
    );
  `);

  // A v1 database predates the user scope; add the column in place. The guard
  // is what makes booting an upgraded install idempotent.
  const columns = database.prepare('PRAGMA table_info(runs)').all() as Array<{
    name: string;
  }>;
  if (!columns.some((column) => column.name === 'user_id')) {
    database.exec('ALTER TABLE runs ADD COLUMN user_id TEXT');
  }
  database.exec('CREATE INDEX IF NOT EXISTS runs_user_idx ON runs(user_id, tour_id)');

  return {
    get(clientId, tourId) {
      const row = database
        .prepare('SELECT * FROM runs WHERE client_id = ? AND tour_id = ?')
        .get(clientId, tourId) as RunRow | undefined;
      return row ? readRow(row) : null;
    },

    put(tourId, record) {
      database
        .prepare(
          `INSERT INTO runs (client_id, tour_id, beat_id, offset_ms, completed, mode, speed, updated_at, user_id)
           VALUES (@clientId, @tourId, @beatId, @offsetMs, @completed, @mode, @speed, @updatedAt, NULL)
           ON CONFLICT(client_id, tour_id) DO UPDATE SET
             beat_id = excluded.beat_id,
             offset_ms = excluded.offset_ms,
             completed = excluded.completed,
             mode = excluded.mode,
             speed = excluded.speed,
             updated_at = excluded.updated_at`,
        )
        .run({
          clientId: record.clientId,
          tourId,
          beatId: record.beatId,
          offsetMs: record.offsetMs,
          completed: JSON.stringify(record.completedBeatIds),
          mode: record.mode,
          speed: record.speed,
          updatedAt: record.updatedAt,
        });
      return record;
    },

    list(clientId) {
      const rows = database
        .prepare('SELECT * FROM runs WHERE client_id = ? ORDER BY updated_at DESC')
        .all(clientId) as RunRow[];
      return rows.map(readRow);
    },

    remove(clientId, tourId) {
      database
        .prepare('DELETE FROM runs WHERE client_id = ? AND tour_id = ?')
        .run(clientId, tourId);
    },

    listUserRuns(userId) {
      const rows = database
        .prepare('SELECT * FROM runs WHERE user_id = ? ORDER BY updated_at DESC')
        .all(userId) as RunRow[];
      return rows.map(readSyncRow);
    },

    getUserRun(userId, tourId) {
      const row = database
        .prepare('SELECT * FROM runs WHERE user_id = ? AND tour_id = ?')
        .get(userId, tourId) as RunRow | undefined;
      return row ? readSyncRow(row) : null;
    },

    putUserRun(userId, run) {
      database
        .prepare(
          `INSERT INTO runs (client_id, tour_id, beat_id, offset_ms, completed, mode, speed, updated_at, user_id)
           VALUES (@clientId, @tourId, @beatId, @offsetMs, @completed, @mode, @speed, @updatedAt, @userId)
           ON CONFLICT(client_id, tour_id) DO UPDATE SET
             beat_id = excluded.beat_id,
             offset_ms = excluded.offset_ms,
             completed = excluded.completed,
             mode = excluded.mode,
             speed = excluded.speed,
             updated_at = excluded.updated_at,
             user_id = excluded.user_id`,
        )
        .run({
          clientId: userClientId(userId),
          tourId: run.tourId,
          beatId: run.beatId,
          offsetMs: run.offsetMs,
          completed: JSON.stringify(run.completedBeatIds),
          mode: run.mode,
          speed: run.speed,
          updatedAt: run.updatedAt,
          userId,
        });
      return run;
    },

    deleteUserRun(userId, tourId, deletedAt) {
      database
        .prepare('DELETE FROM runs WHERE user_id = ? AND tour_id = ?')
        .run(userId, tourId);
      database
        .prepare(
          `INSERT INTO run_tombstones (user_id, tour_id, deleted_at)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id, tour_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
        )
        .run(userId, tourId, deletedAt);
    },

    listTombstones(userId) {
      const rows = database
        .prepare('SELECT * FROM run_tombstones WHERE user_id = ? ORDER BY deleted_at DESC')
        .all(userId) as TombstoneRow[];
      return rows.map((row): RunTombstone => ({
        tourId: row.tour_id,
        deletedAt: row.deleted_at,
      }));
    },

    listAnonymousRuns(clientId) {
      const rows = database
        .prepare(
          'SELECT * FROM runs WHERE client_id = ? AND user_id IS NULL ORDER BY updated_at DESC',
        )
        .all(clientId) as RunRow[];
      return rows.map(readSyncRow);
    },

    removeAnonymousRuns(clientId) {
      database
        .prepare('DELETE FROM runs WHERE client_id = ? AND user_id IS NULL')
        .run(clientId);
    },

    deleteUserRuns(userId) {
      database.prepare('DELETE FROM runs WHERE user_id = ?').run(userId);
      database.prepare('DELETE FROM run_tombstones WHERE user_id = ?').run(userId);
    },

    close() {
      database.close();
    },
  };
}
