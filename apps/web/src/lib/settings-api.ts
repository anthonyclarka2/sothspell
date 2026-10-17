/**
 * The browser-side settings client. It only ever speaks to `/api/settings`;
 * the server never returns a secret value, so nothing here can cache one.
 */

export type ProfileKind = 'authoring' | 'narration';
export type ProfileProvider =
  'openai' | 'anthropic' | 'openai-compatible' | 'elevenlabs' | 'browser';

export interface PublicProfile {
  id: string;
  name: string;
  kind: ProfileKind;
  provider: ProfileProvider;
  baseUrl: string | null;
  modelId: string | null;
  voiceId: string | null;
  outputFormat: string | null;
  secretRef: string | null;
  hasSecret: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsEnv {
  authoring: {
    modelId: string | null;
  };
  narration: {
    voiceId: string | null;
    modelId: string | null;
    hasApiKey: boolean;
  };
}

export interface SettingsResponse {
  profiles: PublicProfile[];
  env: SettingsEnv;
}

export interface ProfileIssue {
  path: string;
  message: string;
}

export interface ProfileTestResult {
  ok: boolean;
  latencyMs: number;
  error?: string | null;
  detail?: string | null;
  modelId?: string | null;
  voiceId?: string | null;
}

export interface ProfileDraft {
  name: string;
  kind?: ProfileKind;
  provider: ProfileProvider;
  baseUrl?: string | null;
  modelId?: string | null;
  voiceId?: string | null;
  outputFormat?: string | null;
  /** Write-only: sent once, never returned. */
  secret?: string;
}

export class SettingsApiError extends Error {
  readonly status: number;
  readonly issues: ProfileIssue[];

  constructor(message: string, status: number, issues: ProfileIssue[] = []) {
    super(message);
    this.name = 'SettingsApiError';
    this.status = status;
    this.issues = issues;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      issues?: ProfileIssue[];
    } | null;
    throw new SettingsApiError(
      body?.error ?? `request failed with ${response.status}`,
      response.status,
      body?.issues ?? [],
    );
  }
  return (await response.json()) as T;
}

export async function fetchSettings(): Promise<SettingsResponse> {
  return readJson<SettingsResponse>(await fetch('/api/settings/profiles'));
}

export async function createProfile(draft: ProfileDraft): Promise<PublicProfile> {
  const response = await fetch('/api/settings/profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(draft),
  });
  return readJson<PublicProfile>(response);
}

export async function updateProfile(
  id: string,
  draft: Partial<ProfileDraft> & { secret?: string | null },
): Promise<PublicProfile> {
  const response = await fetch(`/api/settings/profiles/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(draft),
  });
  return readJson<PublicProfile>(response);
}

export async function deleteProfile(id: string): Promise<void> {
  await readJson<{ ok: boolean }>(
    await fetch(`/api/settings/profiles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  );
}

export async function activateProfile(id: string): Promise<PublicProfile> {
  const response = await fetch(
    `/api/settings/profiles/${encodeURIComponent(id)}/activate`,
    { method: 'POST' },
  );
  return readJson<PublicProfile>(response);
}

export async function testProfile(id: string): Promise<ProfileTestResult> {
  const response = await fetch(`/api/settings/profiles/${encodeURIComponent(id)}/test`, {
    method: 'POST',
  });
  // A failed provider test is an expected outcome, not a client error: the
  // route maps it to 502 with a redacted message the UI shows in the status
  // region.
  if (response.status === 502) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      latencyMs?: number;
    } | null;
    return {
      ok: false,
      latencyMs: body?.latencyMs ?? 0,
      error: body?.error ?? 'the provider test failed',
    };
  }
  return readJson<ProfileTestResult>(response);
}
