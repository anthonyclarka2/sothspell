import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_COOKIE,
  codeChallengeFor,
  createMemoryAccountStore,
  type DevicePollResult,
} from '@sothspell/accounts';
import {
  createAuthRuntime,
  registerAuthRoutes,
  type AuthRuntimeOptions,
} from './auth.js';

const ENV_KEYS = [
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'SOTHSPELL_PUBLIC_URL',
  'SOTHSPELL_SESSION_SECRET',
];

const savedEnv = new Map<string, string | undefined>();
for (const key of ENV_KEYS) {
  savedEnv.set(key, process.env[key]);
  delete process.env[key];
}

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

interface RecordedGithubCall {
  url: string;
  body: Record<string, unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fakeGithubProvider(
  options: { devicePolls?: DevicePollResult[]; failExchange?: boolean } = {},
) {
  const calls: RecordedGithubCall[] = [];
  const polls: DevicePollResult[] = [
    ...(options.devicePolls ?? [{ status: 'complete', accessToken: 'gho_device_token' }]),
  ];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    calls.push({ url, body });

    if (url.endsWith('/login/oauth/access_token')) {
      if (typeof body.grant_type === 'string') {
        const next = polls.shift() ?? { status: 'pending' as const };
        switch (next.status) {
          case 'complete':
            return json({ access_token: next.accessToken });
          case 'pending':
            return json({ error: 'authorization_pending' });
          case 'slow-down':
            return json({ error: 'slow_down' });
          case 'expired':
            return json({ error: 'expired_token' });
          case 'denied':
            return json({ error: 'access_denied' });
        }
      }
      if (options.failExchange) {
        return json({ error: 'bad_verification_code' });
      }
      return json({ access_token: 'gho_code_token' });
    }
    if (url.endsWith('/user')) {
      return json({
        id: 7,
        login: 'octocat',
        name: 'The Octocat',
        avatar_url: 'https://avatars.example/octocat.png',
      });
    }
    if (url.endsWith('/login/device/code')) {
      return json({
        device_code: 'device-1',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.test/login/device',
        expires_in: 900,
        interval: 5,
      });
    }
    return new Response('unexpected provider call', { status: 500 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function cookieValue(response: Response, name: string): string {
  const entry = response.headers
    .getSetCookie()
    .find((header) => header.startsWith(`${name}=`));
  return entry ? (entry.slice(name.length + 1).split(';')[0] ?? '') : '';
}

function cookieHeader(name: string, value: string): Record<string, string> {
  return { cookie: `${name}=${value}` };
}

function combinedCookieHeader(
  ...pairs: Array<[name: string, value: string]>
): Record<string, string> {
  return { cookie: pairs.map(([name, value]) => `${name}=${value}`).join('; ') };
}

function makeApp(overrides: Partial<AuthRuntimeOptions> = {}) {
  const provider = fakeGithubProvider();
  let now = 1_000_000;
  const accountStore = createMemoryAccountStore();
  const runtime = createAuthRuntime({
    accountStore,
    sessionSecret: 'test-session-secret',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    publicUrl: 'http://127.0.0.1:4319',
    githubBaseUrl: 'https://github.test',
    apiBaseUrl: 'https://api.github.test',
    fetchImpl: provider.fetchImpl,
    now: () => now,
    ...overrides,
  });
  const app = new Hono();
  registerAuthRoutes(app, runtime);
  return {
    app,
    runtime,
    accountStore,
    provider,
    advance(ms: number) {
      now += ms;
    },
  };
}

async function startSignIn(app: Hono) {
  const response = await app.request('/api/auth/github');
  const location = new URL(response.headers.get('location') ?? '');
  return {
    response,
    location,
    state: location.searchParams.get('state') ?? '',
    oauthCookie: cookieValue(response, 'sothspell_oauth'),
  };
}

async function completeSignIn(app: Hono) {
  const started = await startSignIn(app);
  const callback = await app.request(
    `/api/auth/github/callback?code=code-1&state=${encodeURIComponent(started.state)}`,
    { headers: cookieHeader('sothspell_oauth', started.oauthCookie) },
  );
  return { ...started, callback, sessionCookie: cookieValue(callback, SESSION_COOKIE) };
}

describe('GET /api/auth/github', () => {
  it('reports that sign-in is unconfigured without a client id', async () => {
    const { app } = makeApp({ clientId: null });
    const response = await app.request('/api/auth/github');
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('GITHUB_CLIENT_ID'),
    });
  });

  it('redirects to GitHub with PKCE, state, and an httpOnly state cookie', async () => {
    const { app } = makeApp();

    const response = await app.request('/api/auth/github');

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://github.test');
    expect(location.searchParams.get('client_id')).toBe('client-1');
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:4319/api/auth/github/callback',
    );
    expect(location.searchParams.get('scope')).toBe('read:user');
    expect(location.searchParams.get('state')).not.toBe('');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');

    const cookieHeaderValue = response.headers
      .getSetCookie()
      .find((header) => header.startsWith('sothspell_oauth='));
    expect(cookieHeaderValue).toContain('HttpOnly');
    expect(cookieHeaderValue).toContain('SameSite=Lax');
  });
});

describe('GET /api/auth/github/callback', () => {
  it('exchanges the code with the PKCE verifier and signs the browser in', async () => {
    const { app, accountStore, provider } = makeApp();

    const started = await startSignIn(app);
    const callback = await app.request(
      `/api/auth/github/callback?code=code-1&state=${encodeURIComponent(started.state)}`,
      {
        headers: {
          'user-agent': 'vitest-browser',
          ...cookieHeader('sothspell_oauth', started.oauthCookie),
        },
      },
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe(
      'http://127.0.0.1:4319/account?signedIn=1',
    );

    const sessionCookieHeader = callback.headers
      .getSetCookie()
      .find((header) => header.startsWith('sothspell_session='));
    expect(sessionCookieHeader).toContain('HttpOnly');
    expect(sessionCookieHeader).toContain('SameSite=Lax');
    expect(sessionCookieHeader).toContain('Path=/');

    const exchange = provider.calls.find((call) =>
      call.url.endsWith('/login/oauth/access_token'),
    );
    const verifier = exchange?.body.code_verifier;
    expect(typeof verifier).toBe('string');
    expect(codeChallengeFor(verifier as string)).toBe(
      started.location.searchParams.get('code_challenge'),
    );

    const sessionCookie = cookieValue(callback, SESSION_COOKIE);
    const session = await app.request('/api/auth/session', {
      headers: cookieHeader(SESSION_COOKIE, sessionCookie),
    });
    const sessionBody = (await session.json()) as {
      user: { id: string; login: string };
      session: { userAgent: string | null };
    };
    expect(sessionBody).toMatchObject({
      signedIn: true,
      configured: true,
      user: {
        login: 'octocat',
        name: 'The Octocat',
        avatarUrl: 'https://avatars.example/octocat.png',
      },
      session: { userAgent: 'vitest-browser' },
    });
    expect(accountStore.getUser(sessionBody.user.id)?.githubId).toBe(7);
  });

  it('rejects a callback whose state does not match the cookie', async () => {
    const { app } = makeApp();
    const started = await startSignIn(app);

    const callback = await app.request(
      '/api/auth/github/callback?code=code-1&state=forged-state',
      { headers: cookieHeader('sothspell_oauth', started.oauthCookie) },
    );

    expect(callback.status).toBe(400);
    const session = await app.request('/api/auth/session');
    await expect(session.json()).resolves.toMatchObject({ signedIn: false });
  });

  it('rotates the session when a signed-in browser signs in again', async () => {
    const { app } = makeApp();
    const first = await completeSignIn(app);

    const secondStarted = await startSignIn(app);
    const second = await app.request(
      `/api/auth/github/callback?code=code-2&state=${encodeURIComponent(secondStarted.state)}`,
      {
        headers: combinedCookieHeader(
          ['sothspell_oauth', secondStarted.oauthCookie],
          [SESSION_COOKIE, first.sessionCookie],
        ),
      },
    );
    const secondCookie = cookieValue(second, SESSION_COOKIE);

    expect(secondCookie).not.toBe(first.sessionCookie);
    const oldSession = await app.request('/api/auth/session', {
      headers: cookieHeader(SESSION_COOKIE, first.sessionCookie),
    });
    await expect(oldSession.json()).resolves.toMatchObject({ signedIn: false });
    const newSession = await app.request('/api/auth/session', {
      headers: cookieHeader(SESSION_COOKIE, secondCookie),
    });
    await expect(newSession.json()).resolves.toMatchObject({ signedIn: true });
  });

  it('redirects to the account page on provider failure without leaking details', async () => {
    const provider = fakeGithubProvider({ failExchange: true });
    const { app } = makeApp({ fetchImpl: provider.fetchImpl });

    const started = await startSignIn(app);
    const callback = await app.request(
      `/api/auth/github/callback?code=code-1&state=${encodeURIComponent(started.state)}`,
      { headers: cookieHeader('sothspell_oauth', started.oauthCookie) },
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe(
      'http://127.0.0.1:4319/account?signin=error',
    );
    expect(await callback.text()).not.toContain('gho_');
  });

  it('never logs the access token or the session cookie', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { app } = makeApp();
      const { callback } = await completeSignIn(app);

      const logged = [...log.mock.calls, ...error.mock.calls, ...warn.mock.calls]
        .flat()
        .map((value) => String(value))
        .join('\n');
      expect(logged).not.toContain('gho_code_token');
      expect(logged).not.toContain('sothspell_session=');
      expect(await callback.text()).not.toContain('gho_code_token');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe('GET /api/auth/session', () => {
  it('reports signed out with configuration flags', async () => {
    const { app } = makeApp();
    const response = await app.request('/api/auth/session');
    await expect(response.json()).resolves.toEqual({
      signedIn: false,
      configured: true,
      sessionSecretConfigured: true,
      redirectUri: 'http://127.0.0.1:4319/api/auth/github/callback',
    });
  });

  it('reports an ephemeral session secret when none is configured', async () => {
    const { app } = makeApp({ sessionSecret: null });
    const response = await app.request('/api/auth/session');
    await expect(response.json()).resolves.toMatchObject({
      sessionSecretConfigured: false,
    });
  });

  it('treats an expired session as signed out', async () => {
    const { app, advance } = makeApp({ sessionTtlMs: 1000 });
    const { sessionCookie } = await completeSignIn(app);

    advance(1001);

    const response = await app.request('/api/auth/session', {
      headers: cookieHeader(SESSION_COOKIE, sessionCookie),
    });
    await expect(response.json()).resolves.toMatchObject({ signedIn: false });
  });

  it('rejects a tampered cookie', async () => {
    const { app } = makeApp();
    const { sessionCookie } = await completeSignIn(app);
    const tampered = `${sessionCookie.slice(0, -2)}xy`;

    const response = await app.request('/api/auth/session', {
      headers: cookieHeader(SESSION_COOKIE, tampered),
    });
    await expect(response.json()).resolves.toMatchObject({ signedIn: false });
  });
});

describe('POST /api/auth/signout', () => {
  it('revokes the session and clears the cookie', async () => {
    const { app } = makeApp();
    const { sessionCookie } = await completeSignIn(app);

    const signout = await app.request('/api/auth/signout', {
      method: 'POST',
      headers: {
        origin: 'http://127.0.0.1:5173',
        ...cookieHeader(SESSION_COOKIE, sessionCookie),
      },
    });
    expect(signout.status).toBe(200);
    expect(
      signout.headers
        .getSetCookie()
        .find((header) => header.startsWith('sothspell_session=')),
    ).toContain('Max-Age=0');

    const session = await app.request('/api/auth/session', {
      headers: cookieHeader(SESSION_COOKIE, sessionCookie),
    });
    await expect(session.json()).resolves.toMatchObject({ signedIn: false });
  });

  it('rejects an untrusted origin without revoking the session', async () => {
    const { app } = makeApp();
    const { sessionCookie } = await completeSignIn(app);

    const signout = await app.request('/api/auth/signout', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        ...cookieHeader(SESSION_COOKIE, sessionCookie),
      },
    });
    expect(signout.status).toBe(403);

    const session = await app.request('/api/auth/session', {
      headers: cookieHeader(SESSION_COOKIE, sessionCookie),
    });
    await expect(session.json()).resolves.toMatchObject({ signedIn: true });
  });

  it('accepts a bearer token from the CLI', async () => {
    const { app } = makeApp();
    const { sessionCookie } = await completeSignIn(app);
    const session = await app.request('/api/auth/session', {
      headers: cookieHeader(SESSION_COOKIE, sessionCookie),
    });
    const body = (await session.json()) as { session: { id: string } };
    expect(body.session.id).not.toBe('');

    const device = await app.request('/api/auth/github/device', { method: 'POST' });
    const start = (await device.json()) as { pendingId: string };
    const poll = await app.request('/api/auth/github/device/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pendingId: start.pendingId }),
    });
    const token = ((await poll.json()) as { token: string }).token;

    const signout = await app.request('/api/auth/signout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(signout.status).toBe(200);

    const after = await app.request('/api/auth/session', {
      headers: { authorization: `Bearer ${token}` },
    });
    await expect(after.json()).resolves.toMatchObject({ signedIn: false });
  });
});

describe('GitHub device flow', () => {
  it('starts a flow, polls it, and mints a bearer session once', async () => {
    const { app } = makeApp();

    const started = await app.request('/api/auth/github/device', { method: 'POST' });
    expect(started.status).toBe(200);
    const start = (await started.json()) as {
      pendingId: string;
      userCode: string;
      verificationUri: string;
      intervalSeconds: number;
      expiresInSeconds: number;
    };
    expect(start).toMatchObject({
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://github.test/login/device',
      intervalSeconds: 5,
      expiresInSeconds: 900,
    });

    const complete = await app.request('/api/auth/github/device/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pendingId: start.pendingId }),
    });
    const completeBody = (await complete.json()) as {
      status: string;
      token: string;
      user: { login: string };
    };
    expect(completeBody.status).toBe('complete');
    expect(completeBody.user.login).toBe('octocat');

    const session = await app.request('/api/auth/session', {
      headers: { authorization: `Bearer ${completeBody.token}` },
    });
    await expect(session.json()).resolves.toMatchObject({
      signedIn: true,
      user: { login: 'octocat' },
    });

    const again = await app.request('/api/auth/github/device/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pendingId: start.pendingId }),
    });
    await expect(again.json()).resolves.toEqual({ status: 'expired' });
  });

  it('reports pending, slow-down, and denied states without minting a session', async () => {
    const provider = fakeGithubProvider({
      devicePolls: [{ status: 'pending' }, { status: 'slow-down' }, { status: 'denied' }],
    });
    const { app } = makeApp({ fetchImpl: provider.fetchImpl });

    const started = await app.request('/api/auth/github/device', { method: 'POST' });
    const { pendingId } = (await started.json()) as { pendingId: string };
    const poll = () =>
      app.request('/api/auth/github/device/poll', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pendingId }),
      });

    await expect((await poll()).json()).resolves.toEqual({
      status: 'pending',
      intervalSeconds: 5,
    });
    await expect((await poll()).json()).resolves.toEqual({
      status: 'pending',
      intervalSeconds: 10,
    });
    await expect((await poll()).json()).resolves.toEqual({ status: 'denied' });
  });

  it('expires a pending flow after its deadline', async () => {
    const provider = fakeGithubProvider({ devicePolls: [{ status: 'pending' }] });
    const { app, advance } = makeApp({ fetchImpl: provider.fetchImpl });

    const started = await app.request('/api/auth/github/device', { method: 'POST' });
    const { pendingId } = (await started.json()) as { pendingId: string };
    advance(900_001);

    const poll = await app.request('/api/auth/github/device/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pendingId }),
    });
    await expect(poll.json()).resolves.toEqual({ status: 'expired' });
  });

  it('rejects an untrusted origin and an invalid payload', async () => {
    const { app } = makeApp();

    const badOrigin = await app.request('/api/auth/github/device', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });
    expect(badOrigin.status).toBe(403);

    const badBody = await app.request('/api/auth/github/device/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pendingId: 'short' }),
    });
    expect(badBody.status).toBe(400);
  });
});
