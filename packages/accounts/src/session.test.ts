import { describe, expect, it } from 'vitest';
import { createMemoryAccountStore } from './memory-store.js';
import { createSessionService, isSessionActive } from './session.js';
import {
  createSessionToken,
  parseSessionToken,
  signValue,
  verifySignedValue,
} from './tokens.js';
import type { AccountStore, OAuthProfile } from './types.js';

const profile: OAuthProfile = {
  githubId: 42,
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: 'https://avatars.example/octocat.png',
};

function setup(options: { ttlMs?: number } = {}) {
  let now = 10_000;
  const store = createMemoryAccountStore();
  const user = store.upsertUserByGithubId(profile, now);
  const sessions = createSessionService({
    store,
    secret: 'test-session-secret',
    ttlMs: options.ttlMs,
    now: () => now,
  });
  return {
    store,
    user,
    sessions,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe('session tokens', () => {
  it('round-trips a signed session id', () => {
    const token = createSessionToken('session-1', 'secret');
    expect(parseSessionToken(token, 'secret')).toBe('session-1');
  });

  it('rejects a tampered payload and a wrong secret', () => {
    const token = createSessionToken('session-1', 'secret');
    const [id] = token.split('.');
    expect(parseSessionToken(`${id}.forged`, 'secret')).toBeNull();
    expect(parseSessionToken(token, 'other-secret')).toBeNull();
    expect(parseSessionToken('not-signed', 'secret')).toBeNull();
  });

  it('round-trips generic signed values', () => {
    const signed = signValue('state.verifier', 'secret');
    expect(verifySignedValue(signed, 'secret')).toBe('state.verifier');
    expect(verifySignedValue('state.verifier.deadbeef', 'secret')).toBeNull();
  });
});

describe('SessionService', () => {
  it('creates a server-side session row and resolves it by token', () => {
    const { store, user, sessions } = setup();

    const { session, token } = sessions.signIn(user.id, { userAgent: 'vitest' });

    expect(session.userId).toBe(user.id);
    expect(store.getSession(session.id)?.userAgent).toBe('vitest');
    expect(sessions.resolve(token)).toMatchObject({
      session: { id: session.id },
      user: { id: user.id },
    });
  });

  it('rotates on every sign-in and leaves the old token valid until revoked', () => {
    const { sessions, user } = setup();

    const first = sessions.signIn(user.id);
    const second = sessions.signIn(user.id);

    expect(second.session.id).not.toBe(first.session.id);
    expect(sessions.resolve(first.token)?.session.id).toBe(first.session.id);
  });

  it('rejects an expired session', () => {
    const { sessions, user, advance } = setup({ ttlMs: 1000 });

    const { token } = sessions.signIn(user.id);
    advance(1001);

    expect(sessions.resolve(token)).toBeNull();
  });

  it('rejects a revoked session and revokes all sessions for a user', () => {
    const { sessions, user } = setup();

    const first = sessions.signIn(user.id);
    const second = sessions.signIn(user.id);
    sessions.revoke(first.session.id);

    expect(sessions.resolve(first.token)).toBeNull();
    expect(sessions.resolve(second.token)).not.toBeNull();

    sessions.revokeAll(user.id);
    expect(sessions.resolve(second.token)).toBeNull();
  });

  it('rejects a valid-looking token whose session row is gone', () => {
    const { sessions, user, store } = setup();
    const { session, token } = sessions.signIn(user.id);
    store.deleteUser(user.id);
    expect(store.getSession(session.id)).toBeNull();
    expect(sessions.resolve(token)).toBeNull();
  });

  it('updates lastSeenAt on resolve', () => {
    const { sessions, user, advance, store } = setup();
    const { session, token } = sessions.signIn(user.id);

    advance(500);
    sessions.resolve(token);

    expect(store.getSession(session.id)?.lastSeenAt).toBe(10_500);
  });
});

describe('isSessionActive', () => {
  it('requires no revocation and a future expiry', () => {
    const base = {
      id: 's',
      userId: 'u',
      createdAt: 0,
      lastSeenAt: 0,
      expiresAt: 100,
      revokedAt: null,
      userAgent: null,
    };
    expect(isSessionActive(base, 50)).toBe(true);
    expect(isSessionActive(base, 100)).toBe(false);
    expect(isSessionActive({ ...base, revokedAt: 10 }, 50)).toBe(false);
  });
});

describe('memory account store', () => {
  it('keeps the account id stable when the same GitHub user signs in again', () => {
    let now = 1;
    const store: AccountStore = createMemoryAccountStore();
    const first = store.upsertUserByGithubId(profile, now);
    now += 100;
    const second = store.upsertUserByGithubId(
      { ...profile, login: 'octocat-renamed', name: null },
      now,
    );

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.login).toBe('octocat-renamed');
    expect(second.name).toBeNull();
    expect(second.updatedAt).toBe(101);
    expect(store.getUser(first.id)?.login).toBe('octocat-renamed');
  });
});
