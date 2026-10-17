import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GuideModel } from '@sothspell/authoring';
import {
  createFakeHarnessBackend,
  createFakePlayerFetch,
  createUnreachableFetch,
} from './conformance.js';
import {
  completedBeatCount,
  createHarnessRuntime,
  perInstallClientId,
  runSummary,
} from './runtime.js';
import {
  defineCapabilities,
  SothspellError,
  type HarnessAdapter,
  type HarnessEvent,
} from './types.js';

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

function fakeAdapter(
  projectRoot: string,
  overrides: Partial<HarnessAdapter> = {},
): HarnessAdapter {
  return {
    id: 'fake',
    capabilities: defineCapabilities(),
    projectRoot: () => projectRoot,
    createModel: () =>
      ({
        id: 'fake/default',
        async generateObject() {
          return { value: {} };
        },
        async generateText() {
          return { text: '{}' };
        },
      }) as GuideModel,
    ...overrides,
  };
}

describe('harness runtime', () => {
  it('writes generated tours under SOTHSPELL_HOME and not into the project', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    await writeFile(
      path.join(project, 'package.json'),
      JSON.stringify({ name: '@demo/app' }),
      'utf8',
    );
    const backend = createFakeHarnessBackend();
    const runtime = createHarnessRuntime(fakeAdapter(project), {
      home,
      maxMinutes: 9,
      dependencies: backend.dependencies,
    });

    const result = await runtime.generate({ maxMinutes: 6 });

    expect(result).toMatchObject({
      tourId: 'tour_conformance',
      playerUrl: 'http://127.0.0.1:4319/t/tour_conformance',
      quality: { chapters: 1 },
    });
    expect(backend.calls).toEqual(['analyze', 'brief', 'pack', 'author']);
    expect(
      await readFile(
        path.join(home, 'projects', 'demo-app', 'tours', 'tour_conformance', 'tour.json'),
        'utf8',
      ),
    ).toContain('"tour_conformance"');
    expect(
      await readFile(
        path.join(
          home,
          'projects',
          'demo-app',
          'tours',
          'tour_conformance',
          'quality.json',
        ),
        'utf8',
      ),
    ).toContain('"chapters": 1');
    expect(await readdir(project)).toEqual(['package.json']);
  });

  it('discovers a tour written by an earlier runtime', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const backend = createFakeHarnessBackend();
    await createHarnessRuntime(fakeAdapter(project), {
      home,
      dependencies: backend.dependencies,
    }).generate({});

    const runtime = createHarnessRuntime(fakeAdapter(project), {
      home,
      fetch: createFakePlayerFetch({ run: null, answer: null }),
    });

    await expect(runtime.status()).resolves.toMatchObject({
      projectRoot: project,
      tourId: 'tour_conformance',
    });
  });

  it('reports run progress and asks the player at the current beat', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const backend = createFakeHarnessBackend();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const base = createFakePlayerFetch({
      run: {
        clientId: 'sothspell-client',
        tourId: 'tour_conformance',
        beatId: 'beat_one',
        offsetMs: 0,
        completedBeatIds: ['beat_one'],
        mode: 'read',
        speed: 1,
        updatedAt: 1,
      },
      answer: {
        answer: { markdown: 'It starts at the entry point.', citations: [] },
        citations: [{ id: 'anchor_entry', label: 'Entry', path: 'src/index.ts' }],
        warnings: [],
      },
    });
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), ...(init === undefined ? {} : { init }) });
      return base(input, init);
    }) as typeof fetch;

    const runtime = createHarnessRuntime(fakeAdapter(project), {
      home,
      dependencies: backend.dependencies,
      fetch: fetchImpl,
    });
    await runtime.generate({});

    await expect(runtime.status()).resolves.toMatchObject({
      tourId: 'tour_conformance',
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
    expect(ask?.url).toBe('http://127.0.0.1:4319/api/tours/tour_conformance/ask');
    expect(JSON.parse(String(ask?.init?.body))).toEqual({
      beatId: 'beat_one',
      question: 'Where does it start?',
    });
    const runRead = requests.find((request) => request.url.includes('/api/runs/'));
    expect(runRead?.url).toContain(
      `clientId=${encodeURIComponent(perInstallClientId(home))}`,
    );
  });

  it('falls back to the first beat when no run exists', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const backend = createFakeHarnessBackend();
    const bodies: unknown[] = [];
    const runtime = createHarnessRuntime(fakeAdapter(project), {
      home,
      dependencies: backend.dependencies,
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes('/api/runs/')) {
          return new Response(JSON.stringify({ error: 'run not found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          });
        }
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ answer: { markdown: 'At the entry.' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch,
    });
    await runtime.generate({});

    await runtime.ask({ question: 'Where does it start?' });

    expect(bodies).toEqual([{ beatId: 'beat_one', question: 'Where does it start?' }]);
  });

  it('uses SOTHSPELL_CLIENT_ID when set and a stable per-install id otherwise', async () => {
    const home = await temporaryDirectory('sothspell-home-');
    expect(perInstallClientId(home)).toBe(perInstallClientId(home));
    expect(perInstallClientId(home)).toMatch(/^sothspell-[a-f0-9]{32}$/);
    expect(perInstallClientId(`${home}-other`)).not.toBe(perInstallClientId(home));

    const project = await temporaryDirectory('sothspell-project-');
    const requests: string[] = [];
    const backend = createFakeHarnessBackend();
    const previous = process.env.SOTHSPELL_CLIENT_ID;
    process.env.SOTHSPELL_CLIENT_ID = 'shared-browser-client';
    try {
      const runtime = createHarnessRuntime(fakeAdapter(project), {
        home,
        dependencies: backend.dependencies,
        fetch: (async (input: string | URL | Request) => {
          requests.push(String(input));
          return new Response(JSON.stringify({ error: 'run not found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          });
        }) as typeof fetch,
      });
      await runtime.generate({});
      await runtime.progress();
      expect(requests[0]).toContain('clientId=shared-browser-client');
    } finally {
      if (previous === undefined) {
        delete process.env.SOTHSPELL_CLIENT_ID;
      } else {
        process.env.SOTHSPELL_CLIENT_ID = previous;
      }
    }
  });

  it('falls back to SOTHSPELL_PLAYER_URL when no player URL is configured', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const launched: string[] = [];
    const previous = process.env.SOTHSPELL_PLAYER_URL;
    process.env.SOTHSPELL_PLAYER_URL = 'http://127.0.0.1:9999';
    try {
      const runtime = createHarnessRuntime(
        fakeAdapter(project, {
          launch: async (url) => {
            launched.push(url);
            return { url, opened: true };
          },
        }),
        { home },
      );
      await expect(runtime.open()).resolves.toEqual({
        playerUrl: 'http://127.0.0.1:9999',
      });
      expect(launched).toEqual(['http://127.0.0.1:9999']);
    } finally {
      if (previous === undefined) {
        delete process.env.SOTHSPELL_PLAYER_URL;
      } else {
        process.env.SOTHSPELL_PLAYER_URL = previous;
      }
    }
  });

  it('rejects concurrent generation and turns cancellation into one failure', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const backend = createFakeHarnessBackend();
    const runtime = createHarnessRuntime(fakeAdapter(project), {
      home,
      dependencies: backend.dependencies,
    });

    backend.hangAuthoring();
    const first = runtime.generate({});
    await backend.whenAuthoringStarts();
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
    const backend = createFakeHarnessBackend();
    const runtime = createHarnessRuntime(fakeAdapter(project), {
      home,
      dependencies: backend.dependencies,
      fetch: createFakePlayerFetch({ run: null, answer: null }),
    });

    await runtime.generate({});
    backend.failNextAuthoring();
    await expect(runtime.generate({})).rejects.toMatchObject({
      code: 'generation_failed',
      message: 'the model went away',
    });
    await expect(runtime.status()).resolves.toMatchObject({
      tourId: 'tour_conformance',
    });
  });

  it('refuses an artifact path inside the project', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const backend = createFakeHarnessBackend();
    const runtime = createHarnessRuntime(fakeAdapter(project), {
      home: path.join(project, '.sothspell'),
      dependencies: backend.dependencies,
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
    const backend = createFakeHarnessBackend();
    const runtime = createHarnessRuntime(fakeAdapter(project), {
      home,
      dependencies: backend.dependencies,
      fetch: createUnreachableFetch(),
    });
    await runtime.generate({});

    await expect(runtime.ask({ question: 'Anybody home?' })).rejects.toMatchObject({
      code: 'ask_failed',
      message: expect.stringContaining('http://127.0.0.1:4319'),
    });
  });

  it('fails loudly when the host cannot generate text', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const backend = createFakeHarnessBackend();
    const runtime = createHarnessRuntime(
      fakeAdapter(project, {
        capabilities: defineCapabilities({ textGeneration: false }),
      }),
      { home, dependencies: backend.dependencies },
    );

    await expect(runtime.generate({})).rejects.toMatchObject({
      code: 'unsupported_capability',
      message: expect.stringContaining('fake'),
    });
    expect(backend.calls).toEqual([]);
  });

  it('emits progress and run.updated events to listeners and the host sink', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const backend = createFakeHarnessBackend();
    const events: HarnessEvent[] = [];
    const sink: HarnessEvent[] = [];
    const runtime = createHarnessRuntime(
      fakeAdapter(project, { emit: (event) => sink.push(event) }),
      {
        home,
        dependencies: backend.dependencies,
        fetch: createFakePlayerFetch({
          run: {
            clientId: 'client',
            tourId: 'tour_conformance',
            beatId: 'beat_one',
            completedBeatIds: ['beat_one', 'beat_one', 'beat_two'],
            mode: 'read',
            speed: 1,
            offsetMs: 0,
            updatedAt: 1,
          },
          answer: null,
        }),
      },
    );
    runtime.events.on((event) => events.push(event));

    await runtime.generate({});
    await runtime.progress();

    expect(events.map((event) => event.name)).toEqual([
      'generation.progress',
      'generation.progress',
      'generation.progress',
      'run.updated',
    ]);
    expect(events[0]).toEqual({
      name: 'generation.progress',
      progress: { stage: 'analyzing' },
    });
    expect(events.at(-1)).toEqual({
      name: 'run.updated',
      tourId: 'tour_conformance',
      beatId: 'beat_one',
      completed: 2,
    });
    expect(sink).toEqual(events);
  });

  it('can suppress run.updated mirroring for hosts that emit it themselves', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const events: HarnessEvent[] = [];
    const runtime = createHarnessRuntime(fakeAdapter(project), {
      home,
      emitRunUpdates: false,
      fetch: createFakePlayerFetch({ run: null, answer: null }),
    });
    runtime.events.on((event) => events.push(event));

    await runtime.progress();

    expect(events).toEqual([]);
  });

  it('notifies the host when the browser cannot open and keeps the URL', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const notifications: string[] = [];
    const runtime = createHarnessRuntime(
      fakeAdapter(project, {
        capabilities: defineCapabilities({ notify: true }),
        launch: async (url) => ({ url, opened: false, error: 'headless' }),
        notify: async (message) => {
          notifications.push(message);
        },
      }),
      { home, startHint: 'start it with `pnpm sothspell serve`' },
    );

    await expect(runtime.open()).resolves.toEqual({
      playerUrl: 'http://127.0.0.1:4319',
    });
    expect(notifications).toEqual([
      'could not open the browser (headless); start it with `pnpm sothspell serve`',
    ]);
  });

  it('dispose clears listeners and cancels an in-flight generation', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const backend = createFakeHarnessBackend();
    const runtime = createHarnessRuntime(fakeAdapter(project), {
      home,
      dependencies: backend.dependencies,
    });

    let observed = 0;
    runtime.events.on(() => {
      observed += 1;
    });
    backend.hangAuthoring();
    const hanging = runtime.generate({});
    await backend.whenAuthoringStarts();
    const beforeDispose = observed;
    await runtime.dispose();
    await expect(hanging).rejects.toMatchObject({ code: 'generation_failed' });
    await runtime.progress();
    expect(beforeDispose).toBeGreaterThan(0);
    expect(observed).toBe(beforeDispose);
  });

  it('keeps a typed error for a missing tour', () => {
    const error = new SothspellError('no_tour', 'nothing here');
    expect(error).toMatchObject({ name: 'SothspellError', code: 'no_tour' });
  });

  it('summarises runs and counts each completed beat once', () => {
    expect(completedBeatCount(['beat_one', 'beat_one', 'beat_two'])).toBe(2);
    expect(completedBeatCount(['beat_one', 7, null])).toBe(1);
    expect(completedBeatCount(undefined)).toBe(0);
    expect(runSummary({ beatId: 'beat_one', completedBeatIds: ['a', 'a'] })).toEqual({
      beatId: 'beat_one',
      completed: 1,
    });
    expect(runSummary(null)).toBeNull();
    expect(runSummary({ completedBeatIds: [] })).toBeNull();
  });

  it('uses the adapter default model id and passes a configured model through', async () => {
    const project = await temporaryDirectory('sothspell-project-');
    const home = await temporaryDirectory('sothspell-home-');
    const backend = createFakeHarnessBackend();
    const ids: Array<{ id: string; model?: string }> = [];
    const adapter = fakeAdapter(project, {
      createModel: (options) => {
        ids.push({
          id: options.id,
          ...(options.model === undefined ? {} : { model: options.model }),
        });
        return {
          id: options.id,
          async generateObject() {
            return { value: {} };
          },
          async generateText() {
            return { text: '{}' };
          },
        } as GuideModel;
      },
    });

    await createHarnessRuntime(adapter, {
      home,
      dependencies: backend.dependencies,
    }).generate({});
    await createHarnessRuntime(adapter, {
      home,
      dependencies: backend.dependencies,
      model: 'host/model#fast',
    }).generate({});

    expect(ids).toEqual([
      { id: 'fake/default' },
      { id: 'host/model#fast', model: 'host/model#fast' },
    ]);
  });
});
