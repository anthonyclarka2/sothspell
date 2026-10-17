import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'vitest';
import type { GuideModel } from '@sothspell/authoring';
import {
  createFakeHarnessBackend,
  createFakePlayerFetch,
  createUnreachableFetch,
  harnessConformanceCases,
  type HarnessConformanceEnvironment,
} from './conformance.js';
import { createHarnessRuntime } from './runtime.js';
import { defineCapabilities, type HarnessAdapter, type HarnessEvent } from './types.js';

/**
 * The suite proves itself: a deliberately correct fake adapter must pass every
 * conformance case. Real adapters run the same cases with their own fake host.
 */

const playerUrl = 'http://127.0.0.1:4319';

async function environment(): Promise<HarnessConformanceEnvironment> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sothspell-conf-project-'));
  const home = await mkdtemp(path.join(os.tmpdir(), 'sothspell-conf-home-'));
  await writeFile(
    path.join(projectRoot, 'package.json'),
    JSON.stringify({ name: '@conformance/app' }),
    'utf8',
  );

  const backend = createFakeHarnessBackend();
  const events: HarnessEvent[] = [];
  const launches: string[] = [];
  const notifications: string[] = [];
  const run = {
    clientId: 'conformance-client',
    tourId: 'tour_conformance',
    beatId: 'beat_one',
    offsetMs: 0,
    completedBeatIds: ['beat_one'],
    mode: 'read',
    speed: 1,
    updatedAt: 1,
  };
  const answer = {
    answer: { markdown: 'It starts at the entry point.', citations: [] },
    citations: [{ id: 'anchor_entry', label: 'Entry', path: 'src/index.ts' }],
    warnings: [],
  };

  const adapter: HarnessAdapter = {
    id: 'fake',
    capabilities: defineCapabilities({ notify: true, backgroundGeneration: true }),
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
    launch: async (url) => {
      launches.push(url);
      return { url, opened: true };
    },
    notify: async (message) => {
      notifications.push(message);
    },
  };

  const runtime = createHarnessRuntime(adapter, {
    home,
    playerUrl,
    dependencies: backend.dependencies,
    fetch: createFakePlayerFetch({ run, answer }),
  });
  runtime.events.on((event) => events.push(event));
  const unreachableRuntime = createHarnessRuntime(adapter, {
    home,
    playerUrl,
    dependencies: backend.dependencies,
    fetch: createUnreachableFetch(),
  });

  return {
    adapter,
    runtime,
    backend,
    projectRoot,
    home,
    playerUrl,
    events,
    launches,
    notifications,
    run,
    answer,
    unreachableRuntime,
    async cleanup() {
      await rm(projectRoot, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    },
  };
}

describe('harness conformance suite (fake adapter)', () => {
  for (const testCase of harnessConformanceCases(environment)) {
    it(testCase.name, testCase.run);
  }
});
