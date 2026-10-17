import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defaultNarrationAssetRoot } from './app.js';
import { createNarrationService } from './narration.js';
import { createMemoryAssetStore, testAlignment } from './test-support.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function makeProjectRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-api-root-'));
  roots.push(root);
  await mkdir(path.join(root, 'apps', 'api', 'src'), { recursive: true });
  const lines = Array.from({ length: 80 }, (_value, index) => `// line ${index + 1}`);
  await writeFile(
    path.join(root, 'apps', 'api', 'src', 'main.ts'),
    `${lines.join('\n')}\n`,
  );
  return root;
}

function appFor(projectRoot: string | null = null) {
  return createApp({ databasePath: ':memory:', projectRoot });
}

describe('API', () => {
  it('reports health', async () => {
    const response = await appFor().request('/api/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: 'sothspell',
    });
  });

  it('returns the compiled golden tour', async () => {
    const response = await appFor().request('/api/tours/tour_bunbun_golden');

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      id: string;
      chapters: Array<{ beats: Array<{ anchors: Array<{ id: string }> }> }>;
    };

    expect(body.id).toBe('tour_bunbun_golden');
    expect(body.chapters.length).toBe(6);
    expect(body.chapters[0]?.beats[0]?.anchors[0]?.id).toBe('anchor_readme_overview');
  });

  it('returns the embedded anchor when no project root is configured', async () => {
    const response = await appFor().request(
      '/api/projects/bunbun/source/apps/api/src/main.ts?anchor=anchor_main_bootstrap',
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      path: string;
      html: string;
      beatId: string;
      startLine: number;
      stale: boolean;
      lines: Array<{ number: number; focus: boolean }>;
    };

    expect(body.path).toBe('apps/api/src/main.ts');
    expect(body.html).toContain('shiki');
    expect(body.startLine).toBe(37);
    expect(body.beatId).toBe('beat_request_01');
    expect(body.stale).toBe(false);
    expect(body.lines.length).toBeGreaterThan(10);
  });

  it('serves a full file with focus and a stale badge when the hash differs', async () => {
    const projectRoot = await makeProjectRoot();
    const response = await appFor(projectRoot).request(
      '/api/projects/bunbun/source/apps/api/src/main.ts?anchor=anchor_main_bootstrap',
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      totalLines: number;
      stale: boolean;
      lines: Array<{ number: number; focus: boolean }>;
      outline: Array<{ anchorId: string; startLine: number }>;
    };

    expect(body.totalLines).toBe(81);
    expect(body.stale).toBe(true);
    expect(body.lines).toHaveLength(81);
    expect(body.lines[36]?.focus).toBe(true);
    expect(body.lines[0]?.focus).toBe(false);
    expect(body.outline).toContainEqual(
      expect.objectContaining({ anchorId: 'anchor_main_bootstrap', startLine: 37 }),
    );
  });

  it('rejects an unknown anchor', async () => {
    const response = await appFor().request(
      '/api/projects/bunbun/source/apps/api/src/main.ts?anchor=anchor_missing',
    );

    expect(response.status).toBe(404);
  });

  it('rejects a source path that does not match the anchor', async () => {
    const response = await appFor().request(
      '/api/projects/bunbun/source/etc/passwd?anchor=anchor_main_bootstrap',
    );

    expect(response.status).toBe(404);
  });

  it('stores, reads, updates, and deletes an anonymous run', async () => {
    const app = appFor();
    const payload = {
      clientId: 'client-test-1234',
      beatId: 'beat_purpose_01',
      offsetMs: 1200,
      completedBeatIds: ['beat_purpose_01'],
      mode: 'read',
      speed: 1,
    };

    const put = await app.request('/api/runs/tour_bunbun_golden', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(put.status).toBe(200);

    const get = await app.request(
      '/api/runs/tour_bunbun_golden?clientId=client-test-1234',
    );
    expect(get.status).toBe(200);
    await expect(get.json()).resolves.toMatchObject({
      beatId: 'beat_purpose_01',
      completedBeatIds: ['beat_purpose_01'],
    });

    const update = await app.request('/api/runs/tour_bunbun_golden', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, beatId: 'beat_purpose_02', offsetMs: 0 }),
    });
    expect(update.status).toBe(200);

    const list = await app.request('/api/runs?clientId=client-test-1234');
    await expect(list.json()).resolves.toMatchObject({
      runs: [expect.objectContaining({ beatId: 'beat_purpose_02' })],
    });

    const remove = await app.request(
      '/api/runs/tour_bunbun_golden?clientId=client-test-1234',
      { method: 'DELETE' },
    );
    expect(remove.status).toBe(200);

    const missing = await app.request(
      '/api/runs/tour_bunbun_golden?clientId=client-test-1234',
    );
    expect(missing.status).toBe(404);
  });

  it('serves a generated tour stored under SOTHSPELL_HOME', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'sothspell-api-home-'));
    roots.push(home);
    const previous = process.env.SOTHSPELL_HOME;
    process.env.SOTHSPELL_HOME = home;
    try {
      const tourDirectory = path.join(
        home,
        'projects',
        'generated',
        'tours',
        'tour_generated_fixture',
      );
      await mkdir(tourDirectory, { recursive: true });
      await writeFile(
        path.join(tourDirectory, 'tour.json'),
        await readFile(
          new URL('../../../examples/bunbun-tour/tour.json', import.meta.url),
          'utf8',
        ),
      );

      const response = await appFor().request('/api/tours/tour_generated_fixture');
      expect(response.status).toBe(200);
      const body = (await response.json()) as { chapters: unknown[] };
      expect(body.chapters.length).toBe(6);
    } finally {
      if (previous === undefined) {
        delete process.env.SOTHSPELL_HOME;
      } else {
        process.env.SOTHSPELL_HOME = previous;
      }
    }
  });

  it('rejects an invalid run payload', async () => {
    const response = await appFor().request('/api/runs/tour_bunbun_golden', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: 'short' }),
    });

    expect(response.status).toBe(400);
  });

  it('preserves an explicit updatedAt on anonymous runs for CLI pulls', async () => {
    const app = appFor();
    const payload = {
      clientId: 'client-abcdefgh',
      beatId: 'beat_purpose_01',
      offsetMs: 0,
      completedBeatIds: [],
      mode: 'read',
      speed: 1,
      updatedAt: 1234,
    };

    const put = await app.request('/api/runs/tour_bunbun_golden', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await expect(put.json()).resolves.toMatchObject({ updatedAt: 1234 });

    const get = await app.request(
      '/api/runs/tour_bunbun_golden?clientId=client-abcdefgh',
    );
    await expect(get.json()).resolves.toMatchObject({ updatedAt: 1234 });
  });

  it('answers an in-tour question through the injected service', async () => {
    const app = createApp({
      databasePath: ':memory:',
      askService: {
        async answer() {
          return {
            answer: {
              markdown: 'The service owns the operation.',
              citations: ['anchor_service'],
              followUps: [],
            },
            citations: [
              {
                id: 'anchor_service',
                label: 'Service',
                path: 'src/service.ts',
                startLine: 1,
                endLine: 1,
              },
            ],
            warnings: [],
            modelId: 'fake/model',
          };
        },
      },
    });

    const response = await app.request('/api/tours/tour_bunbun_golden/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ beatId: 'beat_purpose_01', question: 'What owns it?' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      modelId: 'fake/model',
      citations: [expect.objectContaining({ id: 'anchor_service' })],
    });
  });

  it('returns 503 for questions when no model is configured', async () => {
    const previous = process.env.SOTHSPELL_MODEL;
    delete process.env.SOTHSPELL_MODEL;
    const app = createApp({ databasePath: ':memory:', askService: null });
    try {
      const response = await app.request('/api/tours/tour_bunbun_golden/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ beatId: 'beat_purpose_01', question: 'Why?' }),
      });
      expect(response.status).toBe(503);
    } finally {
      if (previous !== undefined) {
        process.env.SOTHSPELL_MODEL = previous;
      }
    }
  });

  it('rejects an invalid question payload', async () => {
    const app = createApp({
      databasePath: ':memory:',
      askService: {
        async answer() {
          throw new Error('should not be called');
        },
      },
    });
    const response = await app.request('/api/tours/tour_bunbun_golden/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ beatId: '', question: '' }),
    });

    expect(response.status).toBe(400);
  });

  it('returns a drilldown document through the injected service', async () => {
    const app = createApp({
      databasePath: ':memory:',
      drilldownService: {
        async generate(_tourId: string, anchorId: string) {
          return {
            document: { id: 'tour_child' } as never,
            anchorId,
            beats: 3,
          };
        },
      },
    });
    const response = await app.request('/api/tours/tour_bunbun_golden/drilldown', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ anchorId: 'anchor_readme_overview' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      anchorId: 'anchor_readme_overview',
      beats: 3,
    });
  });
});

function fakeNarration() {
  const assetStore = createMemoryAssetStore();
  const state = { providerCalls: 0 };
  const service = createNarrationService({
    assetStore,
    apiKey: 'test-key',
    voiceId: 'voice-1',
    synthesize: async () => {
      state.providerCalls += 1;
      return {
        audio: Buffer.from('app-mp3'),
        mimeType: 'audio/mpeg',
        durationMs: 500,
        alignment: testAlignment,
      };
    },
    normalizeAlignment: (text) => ({
      sentences: [{ text, startMs: 0, endMs: 500, charStart: 0, charEnd: text.length }],
      words: [],
    }),
  });
  return { assetStore, service, state };
}

describe('narration API', () => {
  it('synthesizes, caches, and serves narration audio through the app', async () => {
    const { assetStore, service, state } = fakeNarration();
    const app = createApp({
      databasePath: ':memory:',
      narrationAssetStore: assetStore,
      narrationService: service,
    });
    const payload = {
      beatId: 'beat_purpose_01',
      text: 'Bunbun keeps discussion records.',
    };

    const first = await app.request('/api/narration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      cached: boolean;
      segment: { beatId: string; provider: string; audio: { url: string } };
    };
    expect(firstBody.cached).toBe(false);
    expect(firstBody.segment).toMatchObject({
      beatId: 'beat_purpose_01',
      provider: 'elevenlabs',
    });

    const audio = await app.request(firstBody.segment.audio.url);
    expect(audio.status).toBe(200);
    expect(Buffer.from(await audio.arrayBuffer()).toString()).toBe('app-mp3');

    const second = await app.request('/api/narration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ cached: true });
    expect(state.providerCalls).toBe(1);
  });

  it('returns 503 when cloud narration is not configured', async () => {
    const service = createNarrationService({
      assetStore: createMemoryAssetStore(),
      voiceId: 'voice-1',
      synthesize: async () => {
        throw new Error('the provider must not be called without a key');
      },
      normalizeAlignment: () => ({ sentences: [], words: [] }),
    });
    const app = createApp({ databasePath: ':memory:', narrationService: service });

    const response = await app.request('/api/narration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ beatId: 'beat_1', text: 'Hello there.' }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('API key'),
    });
  });

  it('rejects an invalid narration payload', async () => {
    const response = await appFor().request('/api/narration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ beatId: 'beat_1', text: '' }),
    });

    expect(response.status).toBe(400);
  });

  it('defaults the narration asset root under SOTHSPELL_HOME', () => {
    const previous = process.env.SOTHSPELL_HOME;
    try {
      process.env.SOTHSPELL_HOME = '/sothspell-test-home';
      expect(defaultNarrationAssetRoot()).toBe('/sothspell-test-home/audio');

      delete process.env.SOTHSPELL_HOME;
      expect(defaultNarrationAssetRoot()).toBe(
        path.join(homedir(), '.sothspell', 'audio'),
      );
    } finally {
      if (previous === undefined) {
        delete process.env.SOTHSPELL_HOME;
      } else {
        process.env.SOTHSPELL_HOME = previous;
      }
    }
  });
});

/**
 * The account flow through the full app: the fake provider stands in for
 * github.com, so nothing here touches the network.
 */
function fakeGithub() {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    if (url.endsWith('/login/oauth/access_token')) {
      if (typeof body.grant_type === 'string') {
        return Response.json({ access_token: 'gho_device_token' });
      }
      return Response.json({ access_token: 'gho_code_token' });
    }
    if (url.endsWith('/user')) {
      return Response.json({
        id: 7,
        login: 'octocat',
        name: 'The Octocat',
        avatar_url: 'https://avatars.example/octocat.png',
      });
    }
    if (url.endsWith('/login/device/code')) {
      return Response.json({
        device_code: 'device-1',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.test/login/device',
        expires_in: 900,
        interval: 5,
      });
    }
    return new Response('unexpected provider call', { status: 500 });
  }) as typeof fetch;
  return { fetchImpl };
}

function accountApp() {
  return createApp({
    databasePath: ':memory:',
    githubClientId: 'client-1',
    githubClientSecret: 'secret-1',
    sessionSecret: 'test-session-secret',
    publicUrl: 'http://127.0.0.1:4319',
    oauthFetchImpl: fakeGithub().fetchImpl,
    now: () => 5_000,
  });
}

function cookieValue(response: Response, name: string): string {
  const entry = response.headers
    .getSetCookie()
    .find((header) => header.startsWith(`${name}=`));
  return entry ? (entry.slice(name.length + 1).split(';')[0] ?? '') : '';
}

async function signInThroughApp(app: ReturnType<typeof createApp>): Promise<string> {
  const start = await app.request('/api/auth/github');
  const location = new URL(start.headers.get('location') ?? '');
  const state = location.searchParams.get('state') ?? '';
  const oauthCookie = cookieValue(start, 'sothspell_oauth');
  const callback = await app.request(
    `/api/auth/github/callback?code=code-1&state=${encodeURIComponent(state)}`,
    { headers: { cookie: `sothspell_oauth=${oauthCookie}` } },
  );
  expect(callback.status).toBe(302);
  return cookieValue(callback, 'sothspell_session');
}

const originHeader = { origin: 'http://127.0.0.1:4319' };

describe('account and sync API through createApp', () => {
  it('signs in, syncs a run, exports, and deletes the account', async () => {
    const app = accountApp();
    const sessionCookie = await signInThroughApp(app);
    const withSession = {
      'content-type': 'application/json',
      ...originHeader,
      cookie: `sothspell_session=${sessionCookie}`,
    };

    const session = await app.request('/api/auth/session', {
      headers: { cookie: `sothspell_session=${sessionCookie}` },
    });
    await expect(session.json()).resolves.toMatchObject({
      signedIn: true,
      configured: true,
      user: { login: 'octocat' },
    });

    const push = await app.request('/api/sync/push', {
      method: 'POST',
      headers: withSession,
      body: JSON.stringify({
        runs: [
          {
            tourId: 'tour_bunbun_golden',
            beatId: 'beat_purpose_01',
            offsetMs: 1200,
            completedBeatIds: ['beat_purpose_01'],
            mode: 'read',
            speed: 1,
            updatedAt: 4_000,
          },
        ],
      }),
    });
    expect(push.status).toBe(200);
    await expect(push.json()).resolves.toMatchObject({
      results: [{ tourId: 'tour_bunbun_golden', status: 'stored' }],
    });

    const pull = await app.request('/api/sync/pull', {
      method: 'POST',
      headers: withSession,
    });
    await expect(pull.json()).resolves.toMatchObject({
      runs: [expect.objectContaining({ beatId: 'beat_purpose_01' })],
      serverTime: 5_000,
    });

    const exported = await app.request('/api/account/export', {
      headers: { cookie: `sothspell_session=${sessionCookie}` },
    });
    expect(exported.headers.get('content-disposition')).toContain('attachment');
    await expect(exported.json()).resolves.toMatchObject({
      account: { login: 'octocat' },
      runs: [expect.objectContaining({ tourId: 'tour_bunbun_golden' })],
    });

    const deleted = await app.request('/api/account', {
      method: 'DELETE',
      headers: { ...originHeader, cookie: `sothspell_session=${sessionCookie}` },
    });
    expect(deleted.status).toBe(200);

    const after = await app.request('/api/auth/session', {
      headers: { cookie: `sothspell_session=${sessionCookie}` },
    });
    await expect(after.json()).resolves.toMatchObject({ signedIn: false });
  });

  it('claims anonymous runs for the client that signs in', async () => {
    const app = accountApp();
    const payload = {
      clientId: 'client-abcdefgh',
      beatId: 'beat_purpose_02',
      offsetMs: 300,
      completedBeatIds: ['beat_purpose_02'],
      mode: 'read',
      speed: 1,
    };
    await app.request('/api/runs/tour_bunbun_golden', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const sessionCookie = await signInThroughApp(app);

    const claimed = await app.request('/api/sync/claim', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...originHeader,
        cookie: `sothspell_session=${sessionCookie}`,
      },
      body: JSON.stringify({ clientId: 'client-abcdefgh' }),
    });

    await expect(claimed.json()).resolves.toMatchObject({
      claimed: 1,
      runs: [expect.objectContaining({ beatId: 'beat_purpose_02' })],
    });
    const anonymous = await app.request(
      '/api/runs/tour_bunbun_golden?clientId=client-abcdefgh',
    );
    expect(anonymous.status).toBe(404);
  });

  it('tombstones the account run when a signed-in client deletes its progress', async () => {
    const app = accountApp();
    const sessionCookie = await signInThroughApp(app);
    const withSession = {
      'content-type': 'application/json',
      ...originHeader,
      cookie: `sothspell_session=${sessionCookie}`,
    };
    await app.request('/api/sync/push', {
      method: 'POST',
      headers: withSession,
      body: JSON.stringify({
        runs: [
          {
            tourId: 'tour_bunbun_golden',
            beatId: 'beat_purpose_01',
            offsetMs: 0,
            completedBeatIds: [],
            mode: 'read',
            speed: 1,
            updatedAt: 4_000,
          },
        ],
      }),
    });

    const removed = await app.request(
      '/api/runs/tour_bunbun_golden?clientId=client-abcdefgh',
      {
        method: 'DELETE',
        headers: { cookie: `sothspell_session=${sessionCookie}` },
      },
    );
    expect(removed.status).toBe(200);

    const pull = await app.request('/api/sync/pull', {
      method: 'POST',
      headers: withSession,
    });
    await expect(pull.json()).resolves.toMatchObject({
      runs: [],
      tombstones: [{ tourId: 'tour_bunbun_golden', deletedAt: 5_000 }],
    });
  });

  it('keeps anonymous runs working when accounts are configured', async () => {
    const app = accountApp();
    const payload = {
      clientId: 'client-abcdefgh',
      beatId: 'beat_purpose_01',
      offsetMs: 100,
      completedBeatIds: [],
      mode: 'read',
      speed: 1,
    };

    const put = await app.request('/api/runs/tour_bunbun_golden', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(put.status).toBe(200);
    const get = await app.request(
      '/api/runs/tour_bunbun_golden?clientId=client-abcdefgh',
    );
    await expect(get.json()).resolves.toMatchObject({ beatId: 'beat_purpose_01' });
  });

  it('exposes the device flow for CLI sign-in through the app', async () => {
    const app = accountApp();

    const started = await app.request('/api/auth/github/device', { method: 'POST' });
    const start = (await started.json()) as { pendingId: string; userCode: string };
    expect(start.userCode).toBe('ABCD-EFGH');

    const poll = await app.request('/api/auth/github/device/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pendingId: start.pendingId }),
    });
    const body = (await poll.json()) as { status: string; token: string };
    expect(body.status).toBe('complete');

    const session = await app.request('/api/auth/session', {
      headers: { authorization: `Bearer ${body.token}` },
    });
    await expect(session.json()).resolves.toMatchObject({
      signedIn: true,
      user: { login: 'octocat' },
    });
  });
});
