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
