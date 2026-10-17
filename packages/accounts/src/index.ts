/**
 * The account domain: GitHub OAuth (PKCE and device flow), server-side
 * sessions, the user-scoped run ports, and the Phase 12 sync merge rules.
 * HTTP routes live in the API app; persistence lives here or in the run store.
 */
export type {
  AccountSession,
  AccountStore,
  AccountUser,
  CreateSessionInput,
  DeviceFlow,
  OAuthProfile,
  RunMode,
  RunSyncStore,
  RunTombstone,
  SyncRun,
} from './types.js';
export { AccountNotFoundError } from './types.js';

export {
  DEFAULT_SESSION_TTL_MS,
  OAUTH_COOKIE,
  OAUTH_STATE_TTL_MS,
  SESSION_COOKIE,
  createSessionToken,
  decodeOAuthState,
  encodeOAuthState,
  parseSessionToken,
  randomToken,
  signValue,
  verifySignedValue,
} from './tokens.js';

export { codeChallengeFor, createCodeVerifier, createOAuthState } from './pkce.js';

export {
  createSessionService,
  isSessionActive,
  type AuthenticatedSession,
  type SessionService,
  type SessionServiceOptions,
} from './session.js';

export { isOriginAllowed, isSecurePublicUrl, originOf } from './security.js';

export {
  OAuthError,
  createGitHubOAuthClient,
  type DeviceFlowStart,
  type DevicePollResult,
  type GitHubOAuthClient,
  type GitHubOAuthClientOptions,
} from './oauth.js';

export {
  mergeRunCollections,
  mergeSyncRun,
  tombstoneWins,
  unionCompletedBeatIds,
} from './merge.js';

export {
  createMemoryAccountStore,
  createMemoryRunSyncStore,
  type MemoryRunSyncStore,
} from './memory-store.js';

export {
  createSyncService,
  type AccountExportBundle,
  type ExportedSession,
  type SyncClaimResult,
  type SyncPullResult,
  type SyncPushEntry,
  type SyncPushResult,
  type SyncService,
  type SyncServiceOptions,
} from './sync-service.js';
