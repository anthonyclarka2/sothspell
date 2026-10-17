/**
 * The account domain types and store ports. The package deliberately has no
 * HTTP and no Hono dependency: the API layer maps these shapes onto routes,
 * and the CLI maps them onto files, so both share one definition of a user,
 * a session, and a synced run.
 */

export type RunMode = 'read' | 'listen' | 'explore';

/** A GitHub-backed identity. Only fields the product needs are stored. */
export interface AccountUser {
  id: string;
  githubId: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

/** The subset of a GitHub profile the account store persists. */
export interface OAuthProfile {
  githubId: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

/** A server-side session row. The cookie only carries the id plus a signature. */
export interface AccountSession {
  id: string;
  userId: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
  userAgent: string | null;
}

/** A pending GitHub device-flow authorization. The device code stays server-side. */
export interface DeviceFlow {
  id: string;
  deviceCode: string;
  intervalSeconds: number;
  createdAt: number;
  expiresAt: number;
}

/** One tour's progress as it crosses the sync boundary. */
export interface SyncRun {
  tourId: string;
  beatId: string;
  offsetMs: number;
  completedBeatIds: string[];
  mode: RunMode;
  speed: number;
  updatedAt: number;
}

/** The record that a synced run was deleted, so deletes do not resurrect. */
export interface RunTombstone {
  tourId: string;
  deletedAt: number;
}

export interface CreateSessionInput {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  userAgent: string | null;
}

export interface AccountStore {
  upsertUserByGithubId(profile: OAuthProfile, now: number): AccountUser;
  getUser(userId: string): AccountUser | null;

  createSession(input: CreateSessionInput): AccountSession;
  getSession(sessionId: string): AccountSession | null;
  touchSession(sessionId: string, at: number): void;
  revokeSession(sessionId: string, at: number): void;
  revokeUserSessions(userId: string, at: number): void;
  listSessions(userId: string): AccountSession[];
  deleteUser(userId: string): void;

  createDeviceFlow(flow: DeviceFlow): void;
  getDeviceFlow(flowId: string): DeviceFlow | null;
  updateDeviceFlowInterval(flowId: string, intervalSeconds: number): void;
  deleteDeviceFlow(flowId: string): void;

  close(): void;
}

/**
 * The user-scoped half of the run store. `apps/api/src/runs.ts` implements it
 * over the same SQLite file as the anonymous v1 table; tests implement it in
 * memory. Anonymous runs stay reachable so first sign-in can claim them.
 */
export interface RunSyncStore {
  listUserRuns(userId: string): SyncRun[];
  getUserRun(userId: string, tourId: string): SyncRun | null;
  putUserRun(userId: string, run: SyncRun): SyncRun;
  deleteUserRun(userId: string, tourId: string, deletedAt: number): void;
  listTombstones(userId: string): RunTombstone[];
  listAnonymousRuns(clientId: string): SyncRun[];
  removeAnonymousRuns(clientId: string): void;
  deleteUserRuns(userId: string): void;
}

export class AccountNotFoundError extends Error {
  constructor(userId: string) {
    super(`account not found: ${userId}`);
    this.name = 'AccountNotFoundError';
  }
}
