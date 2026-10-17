import { openDB, type IDBPDatabase } from 'idb';

export interface StoredRun {
  tourId: string;
  beatId: string;
  offsetMs: number;
  updatedAt: number;
}

const DATABASE_NAME = 'sothspell';
const DATABASE_VERSION = 1;
const RUNS_STORE = 'runs';

let databasePromise: Promise<IDBPDatabase> | undefined;

function database(): Promise<IDBPDatabase> {
  databasePromise ??= openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(RUNS_STORE)) {
        db.createObjectStore(RUNS_STORE, { keyPath: 'tourId' });
      }
    },
  });
  return databasePromise;
}

/**
 * Local-first progress: the browser always owns the latest position, even when
 * the API is unavailable. The server copy (Phase 6) becomes a durability
 * mirror, never a prerequisite for playback.
 */
export async function loadRun(tourId: string): Promise<StoredRun | null> {
  const db = await database();
  const run = (await db.get(RUNS_STORE, tourId)) as StoredRun | undefined;
  return run ?? null;
}

export async function saveRun(run: StoredRun): Promise<void> {
  const db = await database();
  await db.put(RUNS_STORE, { ...run, updatedAt: Date.now() });
}

export async function clearRun(tourId: string): Promise<void> {
  const db = await database();
  await db.delete(RUNS_STORE, tourId);
}
