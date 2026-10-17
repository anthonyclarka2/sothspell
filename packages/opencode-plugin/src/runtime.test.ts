import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BuildContextOptions, ContextPack, GuideModel } from '@sothspell/authoring';
import type { ProjectBrief, ProjectSnapshot } from '@sothspell/analyzer';
import type { SothspellDocument } from '@sothspell/core';
import {
  completedBeatCount,
  createDefaultRuntime,
  launchPlayer,
  SothspellError,
  type DefaultRuntimeDependencies,
  type OpenCodeRuntimeContext,
} from './runtime.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function tourDocument(): SothspellDocument {
  return {
    schemaVersion: '1.0.0',
    id: 'tour_demo',
    title: 'Demo: a truth story',
    subtitle: 'How the demo project fits together',
    audience: 'new-contributor',
    project: {
      slug: 'demo',
      name: 'Demo',
      revision: { commit: 'abcdef1', branch: 'main', dirty: false },
    },
    chapters: [
      {
        id: 'chapter_entry',
        title: 'Entry',
        summary: 'Where the project starts and what it owns.',
        diagrams: [
          {
            id: 'diagram_entry',
            kind: 'architecture',
            title: 'Entry points',
            nodes: [{ id: 'node_entry', label: 'Entry', type: 'service' }],
            edges: [],
          },
        ],
        beats: [
          {
            id: 'beat_one',
            title: 'One entry point',
            narration:
              'The project starts at a single entry point and branches from there.',
            anchors: [
              {
                id: 'anchor_entry',
                path: 'src/index.ts',
                lines: { start: 1, end: 3 },
                contentHash: `sha256:${'a'.repeat(64)}`,
              },
            ],
            stage: { anchorIds: ['anchor_entry'] },
          },
        ],
      },
    ],
  };
}

const snapshot = {
  project: {
    slug: 'demo',
    name: 'Demo',
    revision: { commit: 'abcdef1', branch: 'main', dirty: false },
  },
} as unknown as ProjectSnapshot;

function fakeDependencies(overrides: Partial<DefaultRuntimeDependencies> = {}) {
  const calls: string[] = [];
  const dependencies: DefaultRuntimeDependencies = {
    async analyzeProject() {
      calls.push('analyze');
      return snapshot;
    },
    buildProjectBrief() {
      calls.push('brief');
      return {} as ProjectBrief;
    },
    async buildContextPack(
      _snapshot: ProjectSnapshot,
      _brief: ProjectBrief,
      _options: BuildContextOptions,
    ) {
      calls.push('pack');
      return {} as ContextPack;
    },
    async authorTour() {
      calls.push('author');
      return {
        plan: {},
        document: tourDocument(),
        quality: { chapters: 1, beats: 1, anchors: 1 },
      } as never;
    },
    createModel() {
      calls.push('model');
      return {} as GuideModel;
    },
    ...overrides,
  };
  return { dependencies, calls };
}

function host(directory: string): OpenCodeRuntimeContext {
  return {
    location: { directory },
    generate: {
      async text() {
        return { text: '{}' };
      },
    },
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('launchPlayer', () => {
  it('resolves the URL even when the platform opener fails', async () => {
    const result = await launchPlayer('http://127.0.0.1:5173/', {
      openUrl: async () => {
        throw new Error('no browser here');
      },
    });

    expect(result).toEqual({
      url: 'http://127.0.0.1:5173/',
      opened: false,
      error: 'no browser here',
    });
  });
});

describe('default runtime', () => {
  it('returns the player URL when the browser cannot open', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const runtime = createDefaultRuntime(host(project), {
      home,
      openUrl: async () => {
        throw new Error('headless');
      },
    });

    await expect(runtime.open()).resolves.toEqual({
      playerUrl: 'http://127.0.0.1:5173',
    });
  });

  it('refuses to ask before a tour exists', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const runtime = createDefaultRuntime(host(project), { home });

    await expect(runtime.ask({ question: 'How does it start?' })).rejects.toMatchObject({
      code: 'no_tour',
      message: expect.stringContaining('/sothspell'),
    });
  });

  it('writes generated tours under SOTHSPELL_HOME and not into the project', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    await writeFile(
      path.join(project, 'package.json'),
      JSON.stringify({ name: '@demo/app' }),
      'utf8',
    );
    const { dependencies, calls } = fakeDependencies();
    const runtime = createDefaultRuntime(host(project), {
      home,
      maxMinutes: 9,
      dependencies,
    });

    const result = await runtime.generate({ maxMinutes: 6 });

    expect(result).toMatchObject({
      tourId: 'tour_demo',
      playerUrl: 'http://127.0.0.1:5173/t/tour_demo',
      quality: { chapters: 1 },
    });
    expect(calls).toEqual(['analyze', 'brief', 'pack', 'model', 'author']);
    expect(
      await readFile(
        path.join(home, 'projects', 'demo-app', 'tours', 'tour_demo', 'tour.json'),
        'utf8',
      ),
    ).toContain('"tour_demo"');
    expect(
      await readFile(
        path.join(home, 'projects', 'demo-app', 'tours', 'tour_demo', 'quality.json'),
        'utf8',
      ),
    ).toContain('"chapters": 1');
    expect(await readdir(project)).toEqual(['package.json']);
  });

  it('discovers a tour written by an earlier runtime', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const { dependencies } = fakeDependencies();
    await createDefaultRuntime(host(project), { home, dependencies }).generate({});

    const runtime = createDefaultRuntime(host(project), {
      home,
      fetch: async () => jsonResponse({ error: 'run not found' }, 404),
    });

    await expect(runtime.status()).resolves.toMatchObject({
      projectRoot: project,
      tourId: 'tour_demo',
    });
  });

  it('reports run progress and asks the player at the current beat', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const { dependencies } = fakeDependencies();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, ...(init === undefined ? {} : { init }) });
      if (url.includes('/api/runs/')) {
        return jsonResponse({
          clientId: 'opencode-plugin',
          tourId: 'tour_demo',
          beatId: 'beat_one',
          offsetMs: 0,
          completedBeatIds: ['beat_one'],
          mode: 'read',
          speed: 1,
          updatedAt: 1,
        });
      }
      if (url.endsWith('/ask')) {
        return jsonResponse({
          answer: { markdown: 'It starts at the entry point.', citations: [] },
          citations: [{ id: 'anchor_entry', label: 'Entry', path: 'src/index.ts' }],
          warnings: [],
        });
      }
      return jsonResponse({ error: 'not found' }, 404);
    }) as typeof fetch;

    const runtime = createDefaultRuntime(host(project), {
      home,
      dependencies,
      fetch: fetchImpl,
    });
    await runtime.generate({});

    await expect(runtime.status()).resolves.toMatchObject({
      tourId: 'tour_demo',
      run: { beatId: 'beat_one', completed: 1 },
    });
    await expect(runtime.progress()).resolves.toMatchObject({
      run: { beatId: 'beat_one' },
    });
    await expect(
      runtime.ask({ question: 'Where does it start?' }),
    ).resolves.toMatchObject({
      answer: { answer: { markdown: 'It starts at the entry point.' } },
    });

    const ask = requests.find((request) => request.url.endsWith('/ask'));
    expect(ask?.url).toBe('http://127.0.0.1:5173/api/tours/tour_demo/ask');
    expect(JSON.parse(String(ask?.init?.body))).toEqual({
      beatId: 'beat_one',
      question: 'Where does it start?',
    });
  });

  it('falls back to the first beat when no run exists', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const { dependencies } = fakeDependencies();
    const bodies: unknown[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes('/api/runs/')) {
        return jsonResponse({ error: 'run not found' }, 404);
      }
      bodies.push(JSON.parse(String(init?.body)));
      return jsonResponse({ answer: { markdown: 'At the entry.' }, citations: [] });
    }) as typeof fetch;
    const runtime = createDefaultRuntime(host(project), {
      home,
      dependencies,
      fetch: fetchImpl,
    });
    await runtime.generate({});

    await runtime.ask({ question: 'Where does it start?' });

    expect(bodies).toEqual([{ beatId: 'beat_one', question: 'Where does it start?' }]);
  });

  it('rejects concurrent generation and turns cancellation into one failure', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    let started: (() => void) | null = null;
    const generationStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const { dependencies } = fakeDependencies({
      authorTour: async (_snapshot, _model, options) => {
        started?.();
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        });
      },
    });
    const runtime = createDefaultRuntime(host(project), { home, dependencies });

    const first = runtime.generate({});
    await generationStarted;
    await expect(runtime.generate({})).rejects.toMatchObject({
      code: 'generation_running',
    });
    await runtime.cancel();
    await expect(first).rejects.toMatchObject({
      code: 'generation_failed',
      message: 'generation was cancelled',
    });
  });

  it('keeps the previous tour when a later generation fails', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    let failing = false;
    const { dependencies } = fakeDependencies({
      authorTour: async () => {
        if (failing) {
          throw new Error('the model went away');
        }
        return {
          plan: {},
          document: tourDocument(),
          quality: { chapters: 1 },
        } as never;
      },
    });
    const runtime = createDefaultRuntime(host(project), {
      home,
      dependencies,
      fetch: async () => jsonResponse({ error: 'run not found' }, 404),
    });

    await runtime.generate({});
    failing = true;
    await expect(runtime.generate({})).rejects.toMatchObject({
      code: 'generation_failed',
      message: 'the model went away',
    });
    await expect(runtime.status()).resolves.toMatchObject({
      tourId: 'tour_demo',
    });
  });

  it('refuses an artifact path inside the project', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const { dependencies } = fakeDependencies();
    const runtime = createDefaultRuntime(host(project), {
      home: path.join(project, '.sothspell'),
      dependencies,
    });

    await expect(runtime.generate({})).rejects.toMatchObject({
      code: 'generation_failed',
      message: expect.stringContaining('inside the project root'),
    });
    await expect(readdir(project)).resolves.toEqual([]);
  });

  it('maps an unreachable player to an ask error', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const { dependencies } = fakeDependencies();
    const runtime = createDefaultRuntime(host(project), {
      home,
      dependencies,
      fetch: async () => {
        throw new Error('connection refused');
      },
    });
    await runtime.generate({});

    await expect(runtime.ask({ question: 'Anybody home?' })).rejects.toMatchObject({
      code: 'ask_failed',
      message: expect.stringContaining('http://127.0.0.1:5173'),
    });
  });

  it('keeps a typed error for a missing tour', () => {
    const error = new SothspellError('no_tour', 'nothing here');
    expect(error).toMatchObject({ name: 'SothspellError', code: 'no_tour' });
  });

  it('counts each completed beat once', () => {
    expect(completedBeatCount(['beat_one', 'beat_one', 'beat_two'])).toBe(2);
    expect(completedBeatCount(['beat_one', 7, null])).toBe(1);
    expect(completedBeatCount(undefined)).toBe(0);
  });
});
