import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const RunBodySchema = z.object({
  clientId: z.string().min(8).max(128),
  beatId: z.string().min(1).max(128),
  offsetMs: z.number().int().min(0).max(3_600_000),
  completedBeatIds: z.array(z.string().min(1).max(128)).max(500),
  mode: z.enum(['read', 'listen', 'explore']),
  speed: z.number().min(0.5).max(3),
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

export interface RunStore {
  get(clientId: string, tourId: string): RunRecord | null;
  put(tourId: string, record: RunRecord): RunRecord;
  list(clientId: string): RunRecord[];
  remove(clientId: string, tourId: string): void;
  close(): void;
}

/**
 * The local run store. Progress is anonymous: the client id is generated in the
 * browser and never linked to an account. The table is intentionally simple —
 * last write wins for a single-user local install.
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
      PRIMARY KEY (client_id, tour_id)
    );
  `);

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
          `INSERT INTO runs (client_id, tour_id, beat_id, offset_ms, completed, mode, speed, updated_at)
           VALUES (@clientId, @tourId, @beatId, @offsetMs, @completed, @mode, @speed, @updatedAt)
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

    close() {
      database.close();
    },
  };
}
