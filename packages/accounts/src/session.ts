import {
  createSessionToken,
  parseSessionToken,
  randomToken,
  DEFAULT_SESSION_TTL_MS,
} from './tokens.js';
import type { AccountSession, AccountStore, AccountUser } from './types.js';

export interface AuthenticatedSession {
  session: AccountSession;
  user: AccountUser;
}

export interface SessionServiceOptions {
  store: Pick<
    AccountStore,
    | 'createSession'
    | 'getSession'
    | 'touchSession'
    | 'revokeSession'
    | 'revokeUserSessions'
    | 'getUser'
  >;
  secret: string;
  ttlMs?: number;
  now?: () => number;
}

export interface SessionService {
  /** Creates a fresh session id; every sign-in rotates the cookie. */
  signIn(
    userId: string,
    options?: { userAgent?: string | null },
  ): { session: AccountSession; token: string };
  resolve(token: string): AuthenticatedSession | null;
  revoke(sessionId: string): void;
  revokeAll(userId: string): void;
}

export function isSessionActive(session: AccountSession, now: number): boolean {
  return session.revokedAt === null && session.expiresAt > now;
}

/**
 * Server-side sessions: the store owns expiry and revocation, the signed token
 * only names a row. Nothing about the user is derivable from the cookie.
 */
export function createSessionService(options: SessionServiceOptions): SessionService {
  const ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  const clock = options.now ?? (() => Date.now());

  return {
    signIn(userId, signInOptions = {}) {
      const now = clock();
      const session = options.store.createSession({
        id: randomToken(32),
        userId,
        createdAt: now,
        expiresAt: now + ttlMs,
        userAgent: signInOptions.userAgent ?? null,
      });
      return { session, token: createSessionToken(session.id, options.secret) };
    },

    resolve(token) {
      const sessionId = parseSessionToken(token, options.secret);
      if (!sessionId) {
        return null;
      }
      const session = options.store.getSession(sessionId);
      if (!session) {
        return null;
      }
      const now = clock();
      if (!isSessionActive(session, now)) {
        return null;
      }
      const user = options.store.getUser(session.userId);
      if (!user) {
        return null;
      }
      options.store.touchSession(sessionId, now);
      return { session: { ...session, lastSeenAt: now }, user };
    },

    revoke(sessionId) {
      options.store.revokeSession(sessionId, clock());
    },

    revokeAll(userId) {
      options.store.revokeUserSessions(userId, clock());
    },
  };
}
