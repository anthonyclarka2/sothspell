import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type {
  AuthoringResult,
  BuildContextOptions,
  ContextPack,
  GuideModel,
} from '@sothspell/authoring';
import type { ProjectBrief, ProjectSnapshot } from '@sothspell/analyzer';
import type { SothspellDocument } from '@sothspell/core';
import type { HarnessRuntimeDependencies } from './runtime.js';
import type { HarnessAdapter, HarnessEvent, HarnessRuntime } from './types.js';

/**
 * The harness conformance suite. Any adapter — real or fake — runs these cases
 * against a fake host to prove the shared runtime contract: the capability
 * matrix, the generation lifecycle, cancellation, progress merge, error
 * mapping, and cleanup. The suite deliberately asserts through the runtime's
 * public seam only, so adapters stay free to translate however their host
 * requires.
 *
 * Usage from an adapter's tests:
 *
 * ```ts
 * for (const testCase of harnessConformanceCases(async () => buildEnvironment())) {
 *   it(testCase.name, testCase.run);
 * }
 * ```
 */

export interface HarnessConformanceEnvironment {
  adapter: HarnessAdapter;
  runtime: HarnessRuntime;
  projectRoot: string;
  home: string;
  playerUrl: string;
  /** The fake analyzer/authoring stack the runtime was built with. */
  backend: FakeHarnessBackend;
  /** Events observed through `runtime.events.on`. */
  events: HarnessEvent[];
  /** URLs the fake host launch recorded. */
  launches: string[];
  /** Messages the fake host notify recorded. */
  notifications: string[];
  /** The saved run the fake player serves, or null for "no saved progress". */
  run: unknown | null;
  /** The answer the fake player serves from `ask`. */
  answer: unknown;
  /** A second runtime whose player fetch always throws, when the host allows it. */
  unreachableRuntime?: HarnessRuntime;
  cleanup(): Promise<void>;
}

export interface HarnessConformanceCase {
  name: string;
  run(): Promise<void>;
}

export type HarnessConformanceSetup = () =>
  Promise<HarnessConformanceEnvironment> | HarnessConformanceEnvironment;

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fake local player API: run reads, ask answers, everything else 404s. */
export function createFakePlayerFetch(options: {
  run: unknown | null;
  answer: unknown;
}): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/runs/')) {
      return options.run === null
        ? jsonResponse({ error: 'run not found' }, 404)
        : jsonResponse(options.run);
    }
    if (url.endsWith('/ask')) {
      return jsonResponse(options.answer);
    }
    if (url.endsWith('/api/health')) {
      return jsonResponse({ ok: true, service: 'sothspell', version: 'conformance' });
    }
    void init;
    return jsonResponse({ error: 'not found' }, 404);
  }) as typeof fetch;
}

/** A player API that is not running at all. */
export function createUnreachableFetch(): typeof fetch {
  return (async () => {
    throw new Error('connection refused');
  }) as typeof fetch;
}

/** The tour document the fake authoring backend produces. */
export function fakeTourDocument(): SothspellDocument {
  return {
    schemaVersion: '1.0.0',
    id: 'tour_conformance',
    title: 'Conformance: a truth story',
    subtitle: 'How the conformance project fits together',
    audience: 'new-contributor',
    project: {
      slug: 'conformance',
      name: 'Conformance',
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

export interface FakeHarnessBackend {
  dependencies: HarnessRuntimeDependencies;
  calls: string[];
  document: SothspellDocument;
  quality: unknown;
  /** Make the next authoring call fail with `error`. */
  failNextAuthoring(error?: Error): void;
  /** Make authoring wait until the generation signal aborts. */
  hangAuthoring(): void;
  /** Resolves the first time authoring starts after `hangAuthoring`. */
  whenAuthoringStarts(): Promise<void>;
}

/**
 * A deterministic analyzer and authoring stack. Adapter tests inject it into
 * `createHarnessRuntime` so the conformance suite exercises the runtime, not a
 * real model or filesystem walk.
 */
export function createFakeHarnessBackend(): FakeHarnessBackend {
  const calls: string[] = [];
  const document = fakeTourDocument();
  const snapshot = {
    project: document.project,
  } as unknown as ProjectSnapshot;

  let mode: 'ok' | 'fail' | 'hang' = 'ok';
  let failure: Error = new Error('authoring failed');
  let started: (() => void) | null = null;
  let startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });

  const dependencies: HarnessRuntimeDependencies = {
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
    async authorTour(
      _snapshot: ProjectSnapshot,
      _model: GuideModel,
      options,
    ): Promise<AuthoringResult> {
      calls.push('author');
      if (mode === 'fail') {
        mode = 'ok';
        throw failure;
      }
      if (mode === 'hang') {
        started?.();
        return new Promise<AuthoringResult>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        });
      }
      options.onProgress?.({
        stage: 'chapter',
        chapterIndex: 0,
        detail: 'Entry',
      });
      return {
        plan: {},
        document,
        quality: { chapters: 1, beats: 1, anchors: 1 },
      } as unknown as AuthoringResult;
    },
  };

  return {
    dependencies,
    calls,
    document,
    quality: { chapters: 1, beats: 1, anchors: 1 },
    failNextAuthoring(error = new Error('the model went away')) {
      mode = 'fail';
      failure = error;
    },
    hangAuthoring() {
      mode = 'hang';
      startedPromise = new Promise<void>((resolve) => {
        started = resolve;
      });
    },
    whenAuthoringStarts() {
      return startedPromise;
    },
  };
}

function progressStages(events: HarnessEvent[]): string[] {
  return events
    .filter(
      (event): event is Extract<HarnessEvent, { name: 'generation.progress' }> =>
        event.name === 'generation.progress',
    )
    .map((event) => event.progress.stage);
}

export function harnessConformanceCases(
  setup: HarnessConformanceSetup,
): HarnessConformanceCase[] {
  const withEnvironment = async (
    body: (environment: HarnessConformanceEnvironment) => Promise<void>,
  ): Promise<void> => {
    const environment = await setup();
    try {
      await body(environment);
    } finally {
      await environment.cleanup();
    }
  };

  return [
    {
      name: 'declares a complete capability matrix',
      run: () =>
        withEnvironment(async ({ adapter, runtime }) => {
          for (const [name, value] of Object.entries(adapter.capabilities)) {
            assert.equal(typeof value, 'boolean', `capability ${name} must be a boolean`);
          }
          assert.deepEqual(
            runtime.capabilities,
            adapter.capabilities,
            'the runtime exposes the adapter capabilities unchanged',
          );
        }),
    },

    {
      name: 'fails loudly when the host cannot generate text',
      run: () =>
        withEnvironment(async ({ adapter, runtime }) => {
          if (adapter.capabilities.textGeneration !== false) {
            return;
          }
          await assert.rejects(
            runtime.generate({}),
            (error: unknown) =>
              error instanceof Error &&
              (error as { code?: string }).code === 'unsupported_capability',
            'a host without text generation reports a named capability error',
          );
        }),
    },

    {
      name: 'generates a tour under SOTHSPELL_HOME without writing to the project',
      run: () =>
        withEnvironment(async ({ adapter, runtime, projectRoot, home, playerUrl }) => {
          if (adapter.capabilities.textGeneration === false) {
            return;
          }
          const before = (await readdir(projectRoot)).toSorted();
          const result = await runtime.generate({ maxMinutes: 7 });

          assert.equal(result.tourId, 'tour_conformance');
          assert.equal(result.playerUrl, `${playerUrl}/t/tour_conformance`);
          assert.deepEqual(result.quality, {
            chapters: 1,
            beats: 1,
            anchors: 1,
          });

          const directory = path.join(
            home,
            'projects',
            'conformance-app',
            'tours',
            'tour_conformance',
          );
          const tour = await readFile(path.join(directory, 'tour.json'), 'utf8');
          assert.match(tour, /tour_conformance/);
          await readFile(path.join(directory, 'quality.json'), 'utf8');

          const after = (await readdir(projectRoot)).toSorted();
          assert.deepEqual(after, before, 'the project directory is untouched');

          const status = await runtime.status();
          assert.equal(status.projectRoot, projectRoot);
          assert.equal(status.tourId, 'tour_conformance');
        }),
    },

    {
      name: 'streams generation progress in stage order',
      run: () =>
        withEnvironment(async ({ adapter, runtime, events }) => {
          if (adapter.capabilities.textGeneration === false) {
            return;
          }
          await runtime.generate({});
          const stages = progressStages(events);
          assert.deepEqual(stages.slice(0, 2), ['analyzing', 'packing']);
          assert.ok(stages.includes('chapter'), 'authoring progress reaches the host');
        }),
    },

    {
      name: 'opens the player deep link through the host launch',
      run: () =>
        withEnvironment(async ({ adapter, runtime, launches, playerUrl }) => {
          if (
            adapter.capabilities.textGeneration === false ||
            adapter.capabilities.browserLaunch === false
          ) {
            return;
          }
          await runtime.generate({});
          const opened = await runtime.open();
          assert.equal(opened.playerUrl, `${playerUrl}/t/tour_conformance`);
          assert.equal(
            launches.at(-1),
            `${playerUrl}/t/tour_conformance`,
            'the host launch receives the deep link',
          );
        }),
    },

    {
      name: 'rejects concurrent generation and turns cancel into one named failure',
      run: () =>
        withEnvironment(async ({ adapter, runtime, backend }) => {
          if (adapter.capabilities.textGeneration === false) {
            return;
          }
          backend.hangAuthoring();
          const first = runtime.generate({});
          await backend.whenAuthoringStarts();
          await assert.rejects(
            runtime.generate({}),
            (error: unknown) =>
              error instanceof Error &&
              (error as { code?: string }).code === 'generation_running',
          );
          await runtime.cancel();
          await assert.rejects(
            first,
            (error: unknown) =>
              error instanceof Error &&
              (error as { code?: string }).code === 'generation_failed' &&
              /cancelled/.test(error.message),
          );
        }),
    },

    {
      name: 'merges saved run progress into status and progress',
      run: () =>
        withEnvironment(async ({ adapter, runtime, events, run }) => {
          if (adapter.capabilities.textGeneration === false) {
            return;
          }
          await runtime.generate({});
          const status = await runtime.status();
          const progress = await runtime.progress();

          if (run === null) {
            assert.equal(status.run, null);
            assert.equal(progress.run, null);
            return;
          }
          assert.deepEqual(status.run, { beatId: 'beat_one', completed: 1 });
          assert.deepEqual(progress.run, run);
          const updated = events.filter((event) => event.name === 'run.updated');
          assert.ok(updated.length > 0, 'progress emits a run.updated event');
          assert.deepEqual(updated.at(-1), {
            name: 'run.updated',
            tourId: 'tour_conformance',
            beatId: 'beat_one',
            completed: 1,
          });
        }),
    },

    {
      name: 'refuses to ask before a tour exists and answers at the current beat',
      run: () =>
        withEnvironment(async ({ adapter, runtime, answer }) => {
          if (adapter.capabilities.textGeneration === false) {
            return;
          }
          await assert.rejects(
            runtime.ask({ question: 'How does it start?' }),
            (error: unknown) =>
              error instanceof Error && (error as { code?: string }).code === 'no_tour',
          );

          await runtime.generate({});
          const result = await runtime.ask({ question: 'How does it start?' });
          assert.deepEqual(result.answer, answer);
        }),
    },

    {
      name: 'maps an unreachable player to an ask_failed error',
      run: () =>
        withEnvironment(async ({ adapter, runtime, unreachableRuntime }) => {
          if (adapter.capabilities.textGeneration === false || !unreachableRuntime) {
            return;
          }
          await unreachableRuntime.generate({});
          await assert.rejects(
            unreachableRuntime.ask({ question: 'Anybody home?' }),
            (error: unknown) =>
              error instanceof Error &&
              (error as { code?: string }).code === 'ask_failed' &&
              /not reachable/.test(error.message),
          );
          void runtime;
        }),
    },

    {
      name: 'keeps the previous tour when a later generation fails',
      run: () =>
        withEnvironment(async ({ adapter, runtime, backend }) => {
          if (adapter.capabilities.textGeneration === false) {
            return;
          }
          await runtime.generate({});
          backend.failNextAuthoring();
          await assert.rejects(
            runtime.generate({}),
            (error: unknown) =>
              error instanceof Error &&
              (error as { code?: string }).code === 'generation_failed' &&
              /model went away/.test(error.message),
          );
          const status = await runtime.status();
          assert.equal(status.tourId, 'tour_conformance');
        }),
    },

    {
      name: 'disposes listeners and cancels in-flight work',
      run: () =>
        withEnvironment(async ({ adapter, runtime, backend }) => {
          if (adapter.capabilities.textGeneration === false) {
            return;
          }
          await runtime.generate({});

          let observed = 0;
          runtime.events.on(() => {
            observed += 1;
          });
          await runtime.dispose();
          await runtime.progress();
          assert.equal(observed, 0, 'dispose removes listeners');

          backend.hangAuthoring();
          const hanging = runtime.generate({});
          await backend.whenAuthoringStarts();
          await runtime.dispose();
          await assert.rejects(
            hanging,
            (error: unknown) =>
              error instanceof Error &&
              (error as { code?: string }).code === 'generation_failed' &&
              /cancelled/.test(error.message),
          );

          // The runtime stays usable after dispose; only listeners were dropped.
          await runtime.status();
        }),
    },
  ];
}
