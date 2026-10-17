import { mergeRunCollections, mergeSyncRun, tombstoneWins } from './merge.js';
import {
  AccountNotFoundError,
  type AccountSession,
  type AccountStore,
  type RunSyncStore,
  type RunTombstone,
  type SyncRun,
} from './types.js';

export interface SyncPullResult {
  runs: SyncRun[];
  tombstones: RunTombstone[];
  serverTime: number;
}

export interface SyncPushEntry {
  tourId: string;
  status: 'stored' | 'merged' | 'deleted';
}

export interface SyncPushResult extends SyncPullResult {
  results: SyncPushEntry[];
}

export interface SyncClaimResult {
  claimed: number;
  runs: SyncRun[];
}

export interface ExportedSession {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
  userAgent: string | null;
}

export interface AccountExportBundle {
  exportedAt: number;
  account: {
    id: string;
    githubId: number;
    login: string;
    name: string | null;
    avatarUrl: string | null;
    createdAt: number;
  };
  sessions: ExportedSession[];
  runs: SyncRun[];
  tombstones: RunTombstone[];
}

export interface SyncService {
  pull(userId: string): SyncPullResult;
  push(userId: string, incoming: readonly SyncRun[]): SyncPushResult;
  merge(
    local: readonly SyncRun[],
    remote: readonly SyncRun[],
    tombstones?: readonly RunTombstone[],
  ): SyncRun[];
  claim(userId: string, clientId: string): SyncClaimResult;
  export(userId: string): AccountExportBundle;
  deleteAccount(userId: string): void;
}

export interface SyncServiceOptions {
  accountStore: AccountStore;
  runStore: RunSyncStore;
  now?: () => number;
}

function exportedSession(session: AccountSession): ExportedSession {
  return {
    id: session.id,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    userAgent: session.userAgent,
  };
}

/**
 * The server side of cross-device progress. Pull is a plain read; push merges
 * with the documented rules and answers with the converged state so one round
 * trip is enough; claim is the explicit first-sign-in migration of anonymous
 * local runs.
 */
export function createSyncService(options: SyncServiceOptions): SyncService {
  const clock = options.now ?? (() => Date.now());
  const { accountStore, runStore } = options;

  return {
    pull(userId) {
      return {
        runs: runStore.listUserRuns(userId),
        tombstones: runStore.listTombstones(userId),
        serverTime: clock(),
      };
    },

    push(userId, incoming) {
      const tombstones = new Map(
        runStore.listTombstones(userId).map((tombstone) => [tombstone.tourId, tombstone]),
      );
      const results: SyncPushEntry[] = [];

      for (const run of incoming) {
        const tombstone = tombstones.get(run.tourId);
        if (tombstone && tombstoneWins(tombstone, run)) {
          // The delete is newer than this offline write; do not resurrect.
          results.push({ tourId: run.tourId, status: 'deleted' });
          continue;
        }
        const stored = runStore.getUserRun(userId, run.tourId);
        const merged = stored ? mergeSyncRun(stored, run) : run;
        runStore.putUserRun(userId, merged);
        results.push({ tourId: run.tourId, status: stored ? 'merged' : 'stored' });
      }

      return {
        runs: runStore.listUserRuns(userId),
        tombstones: runStore.listTombstones(userId),
        serverTime: clock(),
        results,
      };
    },

    merge(local, remote, tombstones = []) {
      return mergeRunCollections(local, remote, tombstones);
    },

    claim(userId, clientId) {
      const anonymous = runStore.listAnonymousRuns(clientId);
      for (const run of anonymous) {
        const existing = runStore.getUserRun(userId, run.tourId);
        runStore.putUserRun(userId, existing ? mergeSyncRun(existing, run) : run);
      }
      if (anonymous.length > 0) {
        runStore.removeAnonymousRuns(clientId);
      }
      return { claimed: anonymous.length, runs: runStore.listUserRuns(userId) };
    },

    export(userId) {
      const user = accountStore.getUser(userId);
      if (!user) {
        throw new AccountNotFoundError(userId);
      }
      return {
        exportedAt: clock(),
        account: {
          id: user.id,
          githubId: user.githubId,
          login: user.login,
          name: user.name,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt,
        },
        sessions: accountStore.listSessions(userId).map(exportedSession),
        runs: runStore.listUserRuns(userId),
        tombstones: runStore.listTombstones(userId),
      };
    },

    deleteAccount(userId) {
      accountStore.revokeUserSessions(userId, clock());
      runStore.deleteUserRuns(userId);
      accountStore.deleteUser(userId);
    },
  };
}
