import { randomToken } from './tokens.js';
import type {
  AccountSession,
  AccountStore,
  AccountUser,
  CreateSessionInput,
  DeviceFlow,
  OAuthProfile,
  RunSyncStore,
  RunTombstone,
  SyncRun,
} from './types.js';

function newUserId(): string {
  return `user_${randomToken(12)}`;
}

/**
 * In-memory stores back the domain tests and any future embed/test host. They
 * take every timestamp from the caller so expiry and revocation tests never
 * depend on the wall clock.
 */
export function createMemoryAccountStore(): AccountStore {
  const users = new Map<string, AccountUser>();
  const usersByGithubId = new Map<number, string>();
  const sessions = new Map<string, AccountSession>();
  const deviceFlows = new Map<string, DeviceFlow>();

  return {
    upsertUserByGithubId(profile: OAuthProfile, now) {
      const existingId = usersByGithubId.get(profile.githubId);
      const existing = existingId ? users.get(existingId) : undefined;
      if (existing) {
        const updated: AccountUser = {
          ...existing,
          login: profile.login,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
          updatedAt: now,
        };
        users.set(updated.id, updated);
        return updated;
      }
      const created: AccountUser = {
        id: newUserId(),
        githubId: profile.githubId,
        login: profile.login,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        createdAt: now,
        updatedAt: now,
      };
      users.set(created.id, created);
      usersByGithubId.set(created.githubId, created.id);
      return created;
    },

    getUser(userId) {
      return users.get(userId) ?? null;
    },

    createSession(input: CreateSessionInput) {
      const session: AccountSession = {
        id: input.id,
        userId: input.userId,
        createdAt: input.createdAt,
        lastSeenAt: input.createdAt,
        expiresAt: input.expiresAt,
        revokedAt: null,
        userAgent: input.userAgent,
      };
      sessions.set(session.id, session);
      return session;
    },

    getSession(sessionId) {
      return sessions.get(sessionId) ?? null;
    },

    touchSession(sessionId, at) {
      const session = sessions.get(sessionId);
      if (session) {
        sessions.set(sessionId, { ...session, lastSeenAt: at });
      }
    },

    revokeSession(sessionId, at) {
      const session = sessions.get(sessionId);
      if (session) {
        sessions.set(sessionId, { ...session, revokedAt: at });
      }
    },

    revokeUserSessions(userId, at) {
      for (const [sessionId, session] of sessions) {
        if (session.userId === userId && session.revokedAt === null) {
          sessions.set(sessionId, { ...session, revokedAt: at });
        }
      }
    },

    listSessions(userId) {
      return [...sessions.values()]
        .filter((session) => session.userId === userId)
        .toSorted((left, right) => right.createdAt - left.createdAt);
    },

    deleteUser(userId) {
      const user = users.get(userId);
      if (!user) {
        return;
      }
      users.delete(userId);
      usersByGithubId.delete(user.githubId);
      for (const [sessionId, session] of sessions) {
        if (session.userId === userId) {
          sessions.delete(sessionId);
        }
      }
    },

    createDeviceFlow(flow) {
      deviceFlows.set(flow.id, flow);
    },

    getDeviceFlow(flowId) {
      return deviceFlows.get(flowId) ?? null;
    },

    updateDeviceFlowInterval(flowId, intervalSeconds) {
      const flow = deviceFlows.get(flowId);
      if (flow) {
        deviceFlows.set(flowId, { ...flow, intervalSeconds });
      }
    },

    deleteDeviceFlow(flowId) {
      deviceFlows.delete(flowId);
    },

    close() {
      users.clear();
      usersByGithubId.clear();
      sessions.clear();
      deviceFlows.clear();
    },
  };
}

export interface MemoryRunSyncStore extends RunSyncStore {
  /** Seeds the anonymous scope the way the v1 run table would. */
  seedAnonymous(clientId: string, run: SyncRun): void;
}

function runKey(scope: string, tourId: string): string {
  return `${scope}\u0000${tourId}`;
}

export function createMemoryRunSyncStore(): MemoryRunSyncStore {
  const userRuns = new Map<string, SyncRun>();
  const anonymousRuns = new Map<string, SyncRun>();
  const tombstones = new Map<string, RunTombstone>();

  return {
    seedAnonymous(clientId, run) {
      anonymousRuns.set(runKey(clientId, run.tourId), run);
    },

    listUserRuns(userId) {
      return [...userRuns.values()]
        .filter((run) => userRuns.has(runKey(userId, run.tourId)))
        .toSorted((left, right) => right.updatedAt - left.updatedAt);
    },

    getUserRun(userId, tourId) {
      return userRuns.get(runKey(userId, tourId)) ?? null;
    },

    putUserRun(userId, run) {
      userRuns.set(runKey(userId, run.tourId), run);
      return run;
    },

    deleteUserRun(userId, tourId, deletedAt) {
      userRuns.delete(runKey(userId, tourId));
      tombstones.set(runKey(userId, tourId), { tourId, deletedAt });
    },

    listTombstones(userId) {
      return [...tombstones.entries()]
        .filter(([key]) => key.startsWith(`${userId}\u0000`))
        .map(([, tombstone]) => tombstone)
        .toSorted((left, right) => right.deletedAt - left.deletedAt);
    },

    listAnonymousRuns(clientId) {
      return [...anonymousRuns.entries()]
        .filter(([key]) => key.startsWith(`${clientId}\u0000`))
        .map(([, run]) => run)
        .toSorted((left, right) => right.updatedAt - left.updatedAt);
    },

    removeAnonymousRuns(clientId) {
      for (const key of anonymousRuns.keys()) {
        if (key.startsWith(`${clientId}\u0000`)) {
          anonymousRuns.delete(key);
        }
      }
    },

    deleteUserRuns(userId) {
      for (const key of userRuns.keys()) {
        if (key.startsWith(`${userId}\u0000`)) {
          userRuns.delete(key);
        }
      }
      for (const key of tombstones.keys()) {
        if (key.startsWith(`${userId}\u0000`)) {
          tombstones.delete(key);
        }
      }
    },
  };
}
