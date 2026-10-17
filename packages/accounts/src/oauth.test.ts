import { describe, expect, it } from 'vitest';
import { OAuthError, createGitHubOAuthClient } from './oauth.js';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(responder: (call: RecordedCall) => Response | Promise<Response>): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return responder(call);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function client(fetchImpl: typeof fetch) {
  return createGitHubOAuthClient({
    clientId: 'client-1',
    clientSecret: 'secret-1',
    redirectUri: 'http://127.0.0.1:4319/api/auth/github/callback',
    githubBaseUrl: 'https://github.test',
    apiBaseUrl: 'https://api.github.test',
    fetchImpl,
  });
}

function bodyOf(call: RecordedCall): Record<string, unknown> {
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

describe('GitHub OAuth client', () => {
  it('builds an authorize URL with PKCE, state, and the minimal scope', () => {
    const { fetchImpl } = fakeFetch(() => json({}));
    const url = new URL(
      client(fetchImpl).buildAuthorizeUrl({
        state: 'state-1',
        codeChallenge: 'challenge-1',
      }),
    );

    expect(url.origin).toBe('https://github.test');
    expect(url.pathname).toBe('/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('scope')).toBe('read:user');
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:4319/api/auth/github/callback',
    );
  });

  it('exchanges the code with the PKCE verifier and returns the access token', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ access_token: 'gho_token' }));

    const token = await client(fetchImpl).exchangeCode({
      code: 'code-1',
      codeVerifier: 'verifier-1',
    });

    expect(token).toBe('gho_token');
    expect(calls[0]?.url).toBe('https://github.test/login/oauth/access_token');
    expect(bodyOf(calls[0]!)).toMatchObject({
      client_id: 'client-1',
      code: 'code-1',
      code_verifier: 'verifier-1',
      redirect_uri: 'http://127.0.0.1:4319/api/auth/github/callback',
    });
  });

  it('maps the GitHub profile fields the product stores', async () => {
    const { fetchImpl, calls } = fakeFetch(() =>
      json({
        id: 7,
        login: 'octocat',
        name: 'The Octocat',
        avatar_url: 'https://avatars.example/octocat.png',
        email: 'private@example.com',
      }),
    );

    const profile = await client(fetchImpl).fetchProfile('gho_token');

    expect(profile).toEqual({
      githubId: 7,
      login: 'octocat',
      name: 'The Octocat',
      avatarUrl: 'https://avatars.example/octocat.png',
    });
    expect(calls[0]?.url).toBe('https://api.github.test/user');
    const headers = calls[0]?.init?.headers as Record<string, string> | undefined;
    expect(headers?.authorization).toBe('Bearer gho_token');
  });

  it('never puts a token or a raw payload into an error', async () => {
    const { fetchImpl } = fakeFetch(() =>
      json({ error: 'bad_verification_code', error_description: 'code expired' }, 200),
    );

    await expect(
      client(fetchImpl).exchangeCode({ code: 'code-1', codeVerifier: 'verifier-1' }),
    ).rejects.toThrow('GitHub token exchange failed: bad_verification_code');

    try {
      await client(fetchImpl).exchangeCode({ code: 'code-1', codeVerifier: 'v' });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain('expired');
      expect((error as Error).message).not.toContain('gho_');
    }
  });

  it('rejects a provider error status without reading the body', async () => {
    const { fetchImpl } = fakeFetch(
      () => new Response('token=gho_leaked', { status: 502 }),
    );

    await expect(client(fetchImpl).fetchProfile('gho_token')).rejects.toThrow(
      'GitHub profile request failed: provider returned 502',
    );
  });

  it('starts and polls the device flow, mapping each GitHub status', async () => {
    const responses: Array<Response> = [
      json({
        device_code: 'device-1',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.test/login/device',
        expires_in: 900,
        interval: 5,
      }),
      json({ error: 'authorization_pending' }),
      json({ error: 'slow_down' }),
      json({ error: 'expired_token' }),
      json({ error: 'access_denied' }),
      json({ access_token: 'gho_device_token' }),
    ];
    const { fetchImpl } = fakeFetch(() => responses.shift() ?? json({}));
    const oauth = client(fetchImpl);

    const start = await oauth.startDeviceFlow();
    expect(start).toEqual({
      deviceCode: 'device-1',
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://github.test/login/device',
      expiresInSeconds: 900,
      intervalSeconds: 5,
    });

    expect(await oauth.pollDeviceFlow('device-1')).toEqual({ status: 'pending' });
    expect(await oauth.pollDeviceFlow('device-1')).toEqual({ status: 'slow-down' });
    expect(await oauth.pollDeviceFlow('device-1')).toEqual({ status: 'expired' });
    expect(await oauth.pollDeviceFlow('device-1')).toEqual({ status: 'denied' });
    expect(await oauth.pollDeviceFlow('device-1')).toEqual({
      status: 'complete',
      accessToken: 'gho_device_token',
    });
  });

  it('throws OAuthError for unknown device-flow failures', async () => {
    const { fetchImpl } = fakeFetch(() =>
      json({ error: 'incorrect_client_credentials' }),
    );
    await expect(client(fetchImpl).pollDeviceFlow('device-1')).rejects.toBeInstanceOf(
      OAuthError,
    );
  });
});
