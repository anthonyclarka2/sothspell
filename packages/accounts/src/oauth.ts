import type { OAuthProfile } from './types.js';

/**
 * GitHub's OAuth endpoints, spoken directly with `fetch`. There is no OAuth
 * library: the flow is small enough to read, and every error thrown here is
 * deliberately sanitized so tokens and raw payloads never reach a log line or
 * an API response.
 */
export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthError';
  }
}

export type DevicePollResult =
  | { status: 'pending' }
  | { status: 'slow-down' }
  | { status: 'expired' }
  | { status: 'denied' }
  | { status: 'complete'; accessToken: string };

export interface DeviceFlowStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresInSeconds: number;
  intervalSeconds: number;
}

export interface GitHubOAuthClientOptions {
  clientId: string;
  clientSecret?: string | null;
  redirectUri: string;
  /** Minimal scope: profile fields only, no email and no repository access. */
  scope?: string;
  /** Overridable so tests point at a fake provider. */
  githubBaseUrl?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface GitHubOAuthClient {
  readonly clientId: string;
  readonly redirectUri: string;
  buildAuthorizeUrl(input: { state: string; codeChallenge: string }): string;
  exchangeCode(input: { code: string; codeVerifier: string }): Promise<string>;
  fetchProfile(accessToken: string): Promise<OAuthProfile>;
  startDeviceFlow(): Promise<DeviceFlowStart>;
  pollDeviceFlow(deviceCode: string): Promise<DevicePollResult>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function createGitHubOAuthClient(
  options: GitHubOAuthClientOptions,
): GitHubOAuthClient {
  const githubBaseUrl = options.githubBaseUrl ?? 'https://github.com';
  const apiBaseUrl = options.apiBaseUrl ?? 'https://api.github.com';
  const scope = options.scope ?? 'read:user';
  const fetchImpl = options.fetchImpl ?? fetch;
  const clientSecret = options.clientSecret ?? null;

  async function postJson(
    url: string,
    body: Record<string, unknown>,
    failure: string,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch {
      // Network failures carry no payload worth forwarding.
      throw new OAuthError(`${failure}: network request failed`);
    }
    if (!response.ok) {
      throw new OAuthError(`${failure}: provider returned ${response.status}`);
    }
    return asRecord(await response.json().catch(() => null));
  }

  return {
    clientId: options.clientId,
    redirectUri: options.redirectUri,

    buildAuthorizeUrl({ state, codeChallenge }) {
      const url = new URL('/login/oauth/authorize', githubBaseUrl);
      url.searchParams.set('client_id', options.clientId);
      url.searchParams.set('redirect_uri', options.redirectUri);
      url.searchParams.set('scope', scope);
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('allow_signup', 'true');
      return url.toString();
    },

    async exchangeCode({ code, codeVerifier }) {
      const payload = await postJson(
        new URL('/login/oauth/access_token', githubBaseUrl).toString(),
        {
          client_id: options.clientId,
          ...(clientSecret ? { client_secret: clientSecret } : {}),
          code,
          redirect_uri: options.redirectUri,
          code_verifier: codeVerifier,
        },
        'GitHub token exchange failed',
      );
      const error = asString(payload.error);
      if (error) {
        throw new OAuthError(`GitHub token exchange failed: ${error}`);
      }
      const accessToken = asString(payload.access_token);
      if (!accessToken) {
        throw new OAuthError('GitHub token exchange returned no access token');
      }
      return accessToken;
    },

    async fetchProfile(accessToken) {
      let response: Response;
      try {
        response = await fetchImpl(new URL('/user', apiBaseUrl).toString(), {
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${accessToken}`,
            'x-github-api-version': '2022-11-28',
          },
        });
      } catch {
        throw new OAuthError('GitHub profile request failed: network request failed');
      }
      if (!response.ok) {
        throw new OAuthError(`GitHub profile request failed: provider returned ${response.status}`);
      }
      const payload = asRecord(await response.json().catch(() => null));
      const githubId = typeof payload.id === 'number' ? payload.id : null;
      const login = asString(payload.login);
      if (githubId === null || !login) {
        throw new OAuthError('GitHub profile response was missing id or login');
      }
      return {
        githubId,
        login,
        name: asString(payload.name),
        avatarUrl: asString(payload.avatar_url),
      };
    },

    async startDeviceFlow() {
      const payload = await postJson(
        new URL('/login/device/code', githubBaseUrl).toString(),
        { client_id: options.clientId, scope },
        'GitHub device flow start failed',
      );
      const deviceCode = asString(payload.device_code);
      const userCode = asString(payload.user_code);
      const verificationUri = asString(payload.verification_uri);
      if (!deviceCode || !userCode || !verificationUri) {
        throw new OAuthError('GitHub device flow start returned an incomplete response');
      }
      const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 900;
      const interval = typeof payload.interval === 'number' ? payload.interval : 5;
      return {
        deviceCode,
        userCode,
        verificationUri,
        expiresInSeconds: expiresIn,
        intervalSeconds: interval,
      };
    },

    async pollDeviceFlow(deviceCode) {
      const payload = await postJson(
        new URL('/login/oauth/access_token', githubBaseUrl).toString(),
        {
          client_id: options.clientId,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        },
        'GitHub device flow poll failed',
      );
      const error = asString(payload.error);
      if (error) {
        switch (error) {
          case 'authorization_pending':
            return { status: 'pending' };
          case 'slow_down':
            return { status: 'slow-down' };
          case 'expired_token':
            return { status: 'expired' };
          case 'access_denied':
            return { status: 'denied' };
          default:
            throw new OAuthError(`GitHub device flow poll failed: ${error}`);
        }
      }
      const accessToken = asString(payload.access_token);
      if (!accessToken) {
        throw new OAuthError('GitHub device flow poll returned no access token');
      }
      return { status: 'complete', accessToken };
    },
  };
}
