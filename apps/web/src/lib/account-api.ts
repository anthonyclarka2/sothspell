import {
  deleteLocalRun,
  getOrCreateClientId,
  listRuns,
  loadRun,
  mergeRuns,
  saveRun,
  type RunMode,
  type StoredRun,
} from './run-store.js';

/**
 * The browser half of accounts and sync. Every call is same-origin; the session
 * cookie is httpOnly, so this module never sees a credential. The local
 * IndexedDB copy stays authoritative offline (Phase 12 decision 4).
 */

export interface AccountUserSummary {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface AccountSessionSummary {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  userAgent: string | null;
}

export interface SessionResponse {
  signedIn: boolean;
  configured: boolean;
  sessionSecretConfigured: boolean;
  redirectUri: string;
  user?: AccountUserSummary;
  session?: AccountSessionSummary;
}

export interface AccountResponse {
  user: AccountUserSummary;
  sessions: AccountSessionSummary[];
}

export interface SyncRunPayload {
  tourId: string;
  beatId: string;
  offsetMs: number;
  completedBeatIds: string[];
  mode: RunMode;
  speed: number;
  updatedAt: number;
}

export interface SyncTombstone {
  tourId: string;
  deletedAt: number;
}

export interface SyncPullResponse {
  runs: SyncRunPayload[];
  tombstones: SyncTombstone[];
  serverTime: number;
}

export interface SyncPushEntry {
  tourId: string;
  status: 'stored' | 'merged' | 'deleted';
}

export interface SyncPushResponse extends SyncPullResponse {
  results: SyncPushEntry[];
}

export interface ClaimResponse {
  claimed: number;
  runs: SyncRunPayload[];
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function fetchSession(): Promise<SessionResponse> {
  return readJson<SessionResponse>(await fetch('/api/auth/session'));
}

export async function signOut(): Promise<void> {
  await readJson<{ ok: boolean }>(await fetch('/api/auth/signout', { method: 'POST' }));
}

export async function fetchAccount(): Promise<AccountResponse> {
  return readJson<AccountResponse>(await fetch('/api/account'));
}

export function accountExportUrl(): string {
  return '/api/account/export';
}

export async function deleteAccount(): Promise<void> {
  await readJson<{ ok: boolean }>(await fetch('/api/account', { method: 'DELETE' }));
}

export async function pullSync(): Promise<SyncPullResponse> {
  return readJson<SyncPullResponse>(await fetch('/api/sync/pull', { method: 'POST' }));
}

export async function pushSync(runs: SyncRunPayload[]): Promise<SyncPushResponse> {
  return readJson<SyncPushResponse>(
    await fetch('/api/sync/push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runs }),
    }),
  );
}

export async function claimRuns(clientId: string): Promise<ClaimResponse> {
  return readJson<ClaimResponse>(
    await fetch('/api/sync/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId }),
    }),
  );
}

export interface SyncReport {
  pulled: number;
  pushed: number;
  removed: number;
  remoteRuns: number;
}

function toPayload(run: StoredRun): SyncRunPayload {
  return {
    tourId: run.tourId,
    beatId: run.beatId,
    offsetMs: run.offsetMs,
    completedBeatIds: run.completedBeatIds,
    mode: run.mode,
    speed: run.speed,
    updatedAt: run.updatedAt,
  };
}

/**
 * One explicit sync: pull the account state, merge it into IndexedDB with the
 * documented rules, drop tombstoned runs, then push the converged local set.
 * The order matters — pushing first would let a stale device overwrite a
 * newer position.
 */
export async function syncLocalRuns(): Promise<SyncReport> {
  const clientId = getOrCreateClientId();
  const remote = await pullSync();
  const tombstones = new Map(
    remote.tombstones.map((tombstone) => [tombstone.tourId, tombstone]),
  );

  for (const remoteRun of remote.runs) {
    const tombstone = tombstones.get(remoteRun.tourId);
    if (tombstone && tombstone.deletedAt >= remoteRun.updatedAt) {
      continue;
    }
    const local = await loadRun(remoteRun.tourId);
    const merged = mergeRuns(local, { ...remoteRun, clientId });
    if (merged) {
      await saveRun(merged);
    }
  }

  let removed = 0;
  for (const tombstone of remote.tombstones) {
    const local = await loadRun(tombstone.tourId);
    if (local && local.updatedAt <= tombstone.deletedAt) {
      await deleteLocalRun(tombstone.tourId);
      removed += 1;
    }
  }

  const converged = await listRuns();
  const pushed = await pushSync(converged.map(toPayload));

  return {
    pulled: remote.runs.length,
    pushed: pushed.results.filter((entry) => entry.status !== 'deleted').length,
    removed,
    remoteRuns: pushed.runs.length,
  };
}
