import type { Page, Route } from '@playwright/test';

/**
 * A stateful fake of the settings API for browser tests. The real API is
 * covered by vitest; the e2e specs care about the UI contract, so this fake
 * mirrors the route shapes and status codes (400/409/502 included) without a
 * server or a provider.
 */

export interface FakeProfile {
  id: string;
  name: string;
  kind: 'authoring' | 'narration';
  provider: string;
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

export interface FakeSettingsState {
  profiles: FakeProfile[];
  env: {
    authoring: { modelId: string | null };
    narration: { voiceId: string | null; modelId: string | null; hasApiKey: boolean };
  };
  /** Status and body for the next `POST /:id/test` call. */
  testStatus: number;
  testBody: unknown;
  requests: Array<{ method: string; path: string }>;
}

export function makeProfile(overrides: Partial<FakeProfile> = {}): FakeProfile {
  return {
    id: 'prof_1',
    name: 'Team key',
    kind: 'authoring',
    provider: 'openai',
    baseUrl: null,
    modelId: 'gpt-5.2',
    voiceId: null,
    outputFormat: null,
    secretRef: 'profiles/prof_1',
    hasSecret: true,
    active: true,
    createdAt: '2026-10-17T00:00:00.000Z',
    updatedAt: '2026-10-17T00:00:00.000Z',
    ...overrides,
  };
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function installFakeSettings(
  page: Page,
  initial: Partial<FakeSettingsState> = {},
): Promise<FakeSettingsState> {
  const state: FakeSettingsState = {
    profiles: [],
    env: {
      authoring: { modelId: null },
      narration: { voiceId: null, modelId: null, hasApiKey: false },
    },
    testStatus: 200,
    testBody: { ok: true, latencyMs: 42, detail: 'model openai/gpt-5.2' },
    requests: [],
    ...initial,
  };

  await page.route('**/api/settings/profiles**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    state.requests.push({ method, path: url.pathname });

    const segments = url.pathname.split('/').filter(Boolean);
    const id = segments[3];
    const action = segments[4];
    const body = (() => {
      try {
        return (request.postDataJSON() ?? {}) as Record<string, unknown>;
      } catch {
        return {} as Record<string, unknown>;
      }
    })();

    if (method === 'GET' && id === undefined) {
      return json(route, 200, { profiles: state.profiles, env: state.env });
    }

    if (method === 'POST' && id === undefined) {
      const name = String(body.name ?? '');
      const kind = body.kind === 'narration' ? 'narration' : 'authoring';
      if (
        state.profiles.some(
          (profile) =>
            profile.kind === kind &&
            profile.name.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US'),
        )
      ) {
        return json(route, 409, {
          error: `a profile named "${name}" already exists for this kind`,
        });
      }
      const profile = makeProfile({
        id: `prof_${state.profiles.length + 1}`,
        name,
        kind,
        provider: String(body.provider ?? 'openai'),
        baseUrl: (body.baseUrl as string | null) ?? null,
        modelId: (body.modelId as string | null) ?? null,
        voiceId: (body.voiceId as string | null) ?? null,
        outputFormat: (body.outputFormat as string | null) ?? null,
        secretRef: body.secret ? `profiles/prof_${state.profiles.length + 1}` : null,
        hasSecret: Boolean(body.secret),
        active: !state.profiles.some(
          (candidate) => candidate.kind === kind && candidate.active,
        ),
      });
      if (profile.active) {
        state.profiles = state.profiles.map((candidate) =>
          candidate.kind === kind ? { ...candidate, active: false } : candidate,
        );
      }
      state.profiles.push(profile);
      return json(route, 201, profile);
    }

    const existing = state.profiles.find((profile) => profile.id === id);
    if (!existing) {
      return json(route, 404, { error: 'unknown profile' });
    }

    if (method === 'PUT') {
      const updated: FakeProfile = {
        ...existing,
        ...(body.name === undefined ? {} : { name: String(body.name) }),
        ...(body.provider === undefined ? {} : { provider: String(body.provider) }),
        ...(body.baseUrl === undefined ? {} : { baseUrl: body.baseUrl as string | null }),
        ...(body.modelId === undefined ? {} : { modelId: body.modelId as string | null }),
        ...(body.voiceId === undefined ? {} : { voiceId: body.voiceId as string | null }),
        ...(body.outputFormat === undefined
          ? {}
          : { outputFormat: body.outputFormat as string | null }),
        ...(body.secret === undefined
          ? {}
          : {
              hasSecret: body.secret !== null,
              secretRef: body.secret === null ? null : `profiles/${existing.id}`,
            }),
        updatedAt: '2026-10-17T01:00:00.000Z',
      };
      state.profiles = state.profiles.map((profile) =>
        profile.id === id ? updated : profile,
      );
      return json(route, 200, updated);
    }

    if (method === 'DELETE') {
      state.profiles = state.profiles.filter((profile) => profile.id !== id);
      return json(route, 200, { ok: true });
    }

    if (method === 'POST' && action === 'activate') {
      const activated = { ...existing, active: true };
      state.profiles = state.profiles.map((profile) =>
        profile.kind === existing.kind
          ? { ...profile, active: profile.id === id }
          : profile,
      );
      return json(route, 200, activated);
    }

    if (method === 'POST' && action === 'test') {
      return json(route, state.testStatus, state.testBody);
    }

    return json(route, 405, { error: `unsupported ${method} ${url.pathname}` });
  });

  return state;
}
