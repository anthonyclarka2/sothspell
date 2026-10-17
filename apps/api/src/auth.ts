import type { Context } from 'hono';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import {
  DEFAULT_SESSION_TTL_MS,
  OAUTH_COOKIE,
  OAUTH_STATE_TTL_MS,
  OAuthError,
  SESSION_COOKIE,
  codeChallengeFor,
  createCodeVerifier,
  createGitHubOAuthClient,
  createOAuthState,
  createSessionService,
  decodeOAuthState,
  encodeOAuthState,
  isOriginAllowed,
  isSecurePublicUrl,
  originOf,
  randomToken,
  type AccountSession,
  type AccountStore,
  type AccountUser,
  type AuthenticatedSession,
  type DevicePollResult,
  type GitHubOAuthClient,
  type SessionService,
} from '@sothspell/accounts';

export interface PublicUser {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface PublicSession {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  userAgent: string | null;
}

export function publicUser(user: AccountUser): PublicUser {
  return {
    id: user.id,
    login: user.login,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
}

export function publicSession(session: AccountSession): PublicSession {
  return {
    id: session.id,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    userAgent: session.userAgent,
  };
}

export interface AuthConfig {
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string;
  publicUrl: string;
  allowedOrigins: string[];
  secureCookies: boolean;
  /** False when the process generated an ephemeral secret; sessions then reset on restart. */
  sessionSecretConfigured: boolean;
  sessionTtlMs: number;
}

export interface AuthRuntime {
  accountStore: AccountStore;
  sessions: SessionService;
  oauth: GitHubOAuthClient | null;
  sessionSecret: string;
  config: AuthConfig;
  now: () => number;
}

export interface AuthRuntimeOptions {
  accountStore: AccountStore;
  sessionSecret?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  publicUrl?: string | null;
  allowedOrigins?: readonly string[];
  githubBaseUrl?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sessionTtlMs?: number;
}

const DEFAULT_PUBLIC_URL = 'http://127.0.0.1:4319';

/**
 * Loopback origins for the local player. The Vite dev server proxies `/api`
 * without rewriting Origin, so both ports must be trusted while developing;
 * a self-hosted deployment adds its own origin through `SOTHSPELL_PUBLIC_URL`.
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:4319',
  'http://localhost:4319',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];

function defaultAllowedOrigins(publicUrl: string): string[] {
  const origins = new Set(DEFAULT_ALLOWED_ORIGINS);
  const publicOrigin = originOf(publicUrl);
  if (publicOrigin) {
    origins.add(publicOrigin);
  }
  return [...origins];
}

export function createAuthRuntime(options: AuthRuntimeOptions): AuthRuntime {
  const publicUrl =
    options.publicUrl === undefined
      ? (process.env.SOTHSPELL_PUBLIC_URL ?? DEFAULT_PUBLIC_URL)
      : (options.publicUrl ?? DEFAULT_PUBLIC_URL);
  const clientId =
    options.clientId === undefined
      ? (process.env.GITHUB_CLIENT_ID ?? null)
      : options.clientId;
  const clientSecret =
    options.clientSecret === undefined
      ? (process.env.GITHUB_CLIENT_SECRET ?? null)
      : options.clientSecret;
  const redirectUri = `${publicUrl.replace(/\/$/u, '')}/api/auth/github/callback`;
  // GitHub Enterprise self-hosting can point these at its own host.
  const githubBaseUrl = options.githubBaseUrl ?? process.env.GITHUB_BASE_URL;
  const apiBaseUrl = options.apiBaseUrl ?? process.env.GITHUB_API_BASE_URL;
  const configuredSecret =
    options.sessionSecret === undefined
      ? process.env.SOTHSPELL_SESSION_SECRET
      : options.sessionSecret;
  const sessionSecret = configuredSecret ?? randomToken(32);

  const oauth = clientId
    ? createGitHubOAuthClient({
        clientId,
        clientSecret,
        redirectUri,
        githubBaseUrl,
        apiBaseUrl,
        fetchImpl: options.fetchImpl,
      })
    : null;

  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  const sessions = createSessionService({
    store: options.accountStore,
    secret: sessionSecret,
    ttlMs: sessionTtlMs,
    now: options.now,
  });

  return {
    accountStore: options.accountStore,
    sessions,
    oauth,
    sessionSecret,
    now: options.now ?? (() => Date.now()),
    config: {
      clientId,
      clientSecret,
      redirectUri,
      publicUrl,
      allowedOrigins: options.allowedOrigins
        ? [...options.allowedOrigins]
        : defaultAllowedOrigins(publicUrl),
      secureCookies: isSecurePublicUrl(publicUrl),
      sessionSecretConfigured: Boolean(configuredSecret),
      sessionTtlMs,
    },
  };
}

function bearerToken(context: Context): string | null {
  const header = context.req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

/** Cookie first for browsers, bearer second for the CLI; both name a session row. */
export function resolveAuth(
  context: Context,
  runtime: AuthRuntime,
): AuthenticatedSession | null {
  const bearer = bearerToken(context);
  if (bearer) {
    const authenticated = runtime.sessions.resolve(bearer);
    if (authenticated) {
      return authenticated;
    }
  }
  const cookie = getCookie(context, SESSION_COOKIE);
  if (cookie) {
    return runtime.sessions.resolve(cookie);
  }
  return null;
}

export function requireAuth(
  context: Context,
  runtime: AuthRuntime,
): AuthenticatedSession | Response {
  const authenticated = resolveAuth(context, runtime);
  if (!authenticated) {
    return context.json({ error: 'sign in required' }, 401);
  }
  return authenticated;
}

/** Returns a 403 response when a browser sends an untrusted Origin. */
export function ensureTrustedOrigin(
  context: Context,
  runtime: AuthRuntime,
): Response | null {
  const origin = context.req.header('origin') ?? null;
  if (isOriginAllowed(origin, runtime.config.allowedOrigins)) {
    return null;
  }
  return context.json({ error: 'origin not allowed' }, 403);
}

export function setSessionCookie(
  context: Context,
  runtime: AuthRuntime,
  token: string,
): void {
  setCookie(context, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: runtime.config.sessionTtlMs / 1000,
    secure: runtime.config.secureCookies,
  });
}

export function clearSessionCookie(context: Context, runtime: AuthRuntime): void {
  deleteCookie(context, SESSION_COOKIE, {
    path: '/',
    secure: runtime.config.secureCookies,
  });
}

const DevicePollBodySchema = z.object({
  pendingId: z.string().min(8).max(128),
});

/**
 * The GitHub sign-in routes. The browser flow uses the authorization-code flow
 * with PKCE and a loopback redirect; the CLI uses the device flow and receives
 * a bearer session token once GitHub confirms the user code.
 */
export function registerAuthRoutes(app: Hono, runtime: AuthRuntime): void {
  app.get('/api/auth/github', (context) => {
    const oauth = runtime.oauth;
    if (!oauth) {
      return context.json(
        { error: 'GitHub sign-in is not configured; set GITHUB_CLIENT_ID' },
        503,
      );
    }
    const state = createOAuthState();
    const verifier = createCodeVerifier();
    setCookie(
      context,
      OAUTH_COOKIE,
      encodeOAuthState(state, verifier, runtime.sessionSecret),
      {
        httpOnly: true,
        sameSite: 'Lax',
        path: '/',
        maxAge: OAUTH_STATE_TTL_MS / 1000,
        secure: runtime.config.secureCookies,
      },
    );
    return context.redirect(
      oauth.buildAuthorizeUrl({ state, codeChallenge: codeChallengeFor(verifier) }),
      302,
    );
  });

  app.get('/api/auth/github/callback', async (context) => {
    const oauth = runtime.oauth;
    const query = context.req.query();
    const stored = decodeOAuthState(
      getCookie(context, OAUTH_COOKIE) ?? '',
      runtime.sessionSecret,
    );
    deleteCookie(context, OAUTH_COOKIE, { path: '/' });

    if (!oauth) {
      return context.json({ error: 'GitHub sign-in is not configured' }, 503);
    }
    if (query.error) {
      return context.redirect(`${runtime.config.publicUrl}/account?signin=denied`, 302);
    }
    if (!query.code || !query.state || !stored || stored.state !== query.state) {
      return context.json({ error: 'invalid OAuth state; start sign-in again' }, 400);
    }

    try {
      const accessToken = await oauth.exchangeCode({
        code: query.code,
        codeVerifier: stored.verifier,
      });
      const profile = await oauth.fetchProfile(accessToken);
      const user = runtime.accountStore.upsertUserByGithubId(profile, runtime.now());
      // Rotation: a pre-existing session for this browser dies with the sign-in.
      const existing = resolveAuth(context, runtime);
      if (existing) {
        runtime.sessions.revoke(existing.session.id);
      }
      const { token } = runtime.sessions.signIn(user.id, {
        userAgent: context.req.header('user-agent') ?? null,
      });
      setSessionCookie(context, runtime, token);
      return context.redirect(`${runtime.config.publicUrl}/account?signedIn=1`, 302);
    } catch (error) {
      // OAuthError messages are sanitized by the client; never surface payloads.
      if (error instanceof OAuthError) {
        return context.redirect(`${runtime.config.publicUrl}/account?signin=error`, 302);
      }
      throw error;
    }
  });

  app.get('/api/auth/session', (context) => {
    const authenticated = resolveAuth(context, runtime);
    const base = {
      signedIn: authenticated !== null,
      configured: runtime.oauth !== null,
      sessionSecretConfigured: runtime.config.sessionSecretConfigured,
      redirectUri: runtime.config.redirectUri,
    };
    if (!authenticated) {
      return context.json(base);
    }
    return context.json({
      ...base,
      user: publicUser(authenticated.user),
      session: publicSession(authenticated.session),
    });
  });

  app.post('/api/auth/signout', (context) => {
    const originError = ensureTrustedOrigin(context, runtime);
    if (originError) {
      return originError;
    }
    const authenticated = resolveAuth(context, runtime);
    if (authenticated) {
      runtime.sessions.revoke(authenticated.session.id);
    }
    clearSessionCookie(context, runtime);
    return context.json({ ok: true });
  });

  app.post('/api/auth/github/device', async (context) => {
    const originError = ensureTrustedOrigin(context, runtime);
    if (originError) {
      return originError;
    }
    const oauth = runtime.oauth;
    if (!oauth) {
      return context.json(
        { error: 'GitHub sign-in is not configured; set GITHUB_CLIENT_ID' },
        503,
      );
    }
    try {
      const start = await oauth.startDeviceFlow();
      const flowId = randomToken(16);
      const now = runtime.now();
      runtime.accountStore.createDeviceFlow({
        id: flowId,
        deviceCode: start.deviceCode,
        intervalSeconds: start.intervalSeconds,
        createdAt: now,
        expiresAt: now + start.expiresInSeconds * 1000,
      });
      return context.json({
        pendingId: flowId,
        userCode: start.userCode,
        verificationUri: start.verificationUri,
        intervalSeconds: start.intervalSeconds,
        expiresInSeconds: start.expiresInSeconds,
      });
    } catch (error) {
      if (error instanceof OAuthError) {
        return context.json({ error: error.message }, 502);
      }
      throw error;
    }
  });

  app.post('/api/auth/github/device/poll', async (context) => {
    const originError = ensureTrustedOrigin(context, runtime);
    if (originError) {
      return originError;
    }
    const oauth = runtime.oauth;
    if (!oauth) {
      return context.json({ error: 'GitHub sign-in is not configured' }, 503);
    }
    const body = await context.req.json().catch(() => null);
    const parsed = DevicePollBodySchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: 'invalid device flow payload' }, 400);
    }

    const flow = runtime.accountStore.getDeviceFlow(parsed.data.pendingId);
    if (!flow || flow.expiresAt <= runtime.now()) {
      if (flow) {
        runtime.accountStore.deleteDeviceFlow(flow.id);
      }
      return context.json({ status: 'expired' });
    }

    let result: DevicePollResult;
    try {
      result = await oauth.pollDeviceFlow(flow.deviceCode);
    } catch (error) {
      if (error instanceof OAuthError) {
        return context.json({ error: error.message }, 502);
      }
      throw error;
    }

    switch (result.status) {
      case 'pending':
        return context.json({ status: 'pending', intervalSeconds: flow.intervalSeconds });
      case 'slow-down': {
        const intervalSeconds = flow.intervalSeconds + 5;
        runtime.accountStore.updateDeviceFlowInterval(flow.id, intervalSeconds);
        return context.json({ status: 'pending', intervalSeconds });
      }
      case 'expired':
      case 'denied':
        runtime.accountStore.deleteDeviceFlow(flow.id);
        return context.json({ status: result.status });
      case 'complete': {
        // The device code is single-use; drop the pending row before any await
        // so two concurrent polls cannot mint two sessions from one approval.
        runtime.accountStore.deleteDeviceFlow(flow.id);
        try {
          const profile = await oauth.fetchProfile(result.accessToken);
          const user = runtime.accountStore.upsertUserByGithubId(profile, runtime.now());
          const { session, token } = runtime.sessions.signIn(user.id, {
            userAgent: context.req.header('user-agent') ?? 'sothspell-cli',
          });
          return context.json({
            status: 'complete',
            token,
            user: publicUser(user),
            session: publicSession(session),
          });
        } catch (error) {
          if (error instanceof OAuthError) {
            return context.json({ error: error.message }, 502);
          }
          throw error;
        }
      }
    }
  });
}
