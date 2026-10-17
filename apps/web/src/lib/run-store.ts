import { openDB, type IDBPDatabase } from 'idb';

export type RunMode = 'read' | 'listen' | 'explore';

export interface StoredRun {
  clientId: string;
  tourId: string;
  beatId: string;
  offsetMs: number;
  completedBeatIds: string[];
  mode: RunMode;
  speed: number;
  updatedAt: number;
}

const DATABASE_NAME = 'sothspell';
const DATABASE_VERSION = 1;
const RUNS_STORE = 'runs';
const CLIENT_ID_KEY = 'sothspell-client-id';

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

export function getOrCreateClientId(): string {
  const existing = window.localStorage.getItem(CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }
  const clientId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `client-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  window.localStorage.setItem(CLIENT_ID_KEY, clientId);
  return clientId;
}

/**
 * Local-first progress: the browser always owns the latest position, even when
 * the API is unavailable. The server copy is a durability mirror.
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
  const clientId = window.localStorage.getItem(CLIENT_ID_KEY);
  if (clientId) {
    await fetch(
      `/api/runs/${encodeURIComponent(tourId)}?clientId=${encodeURIComponent(clientId)}`,
      {
        method: 'DELETE',
      },
    ).catch(() => undefined);
  }
}

export async function loadServerRun(tourId: string): Promise<StoredRun | null> {
  const clientId = getOrCreateClientId();
  const response = await fetch(
    `/api/runs/${encodeURIComponent(tourId)}?clientId=${encodeURIComponent(clientId)}`,
  ).catch(() => null);
  if (!response || !response.ok) {
    return null;
  }
  return (await response.json()) as StoredRun;
}

export async function saveServerRun(run: StoredRun): Promise<void> {
  await fetch(`/api/runs/${encodeURIComponent(run.tourId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...run, updatedAt: Date.now() }),
  }).catch(() => undefined);
}

export function mergeRuns(
  local: StoredRun | null,
  server: StoredRun | null,
): StoredRun | null {
  if (!local) {
    return server;
  }
  if (!server) {
    return local;
  }
  const newer = local.updatedAt >= server.updatedAt ? local : server;
  const completed = new Set([...local.completedBeatIds, ...server.completedBeatIds]);
  return { ...newer, completedBeatIds: [...completed] };
}
