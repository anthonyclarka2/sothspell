import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createHarnessRuntime, type HarnessEvent } from '@sothspell/harness';
import {
  createFakeHarnessBackend,
  createFakePlayerFetch,
  createUnreachableFetch,
  harnessConformanceCases,
  type HarnessConformanceEnvironment,
} from '@sothspell/harness/conformance';
import { createCodexAdapter, createCodexRuntime } from './adapter.js';
import type { CodexHost } from './host.js';

/**
 * The conformance suite with a fake Codex host. The host is the only process
 * seam, so the whole adapter — model translation, launch, notify, and the
 * shared runtime — runs without spawning the real CLI.
 */

const playerUrl = 'http://127.0.0.1:4319';

function fakeCodexHost(): CodexHost {
  return {
    async run() {
      return {
        code: 0,
        stdout: JSON.stringify({
          type: 'item.completed',
          item: { id: 'item_1', type: 'agent_message', text: '{}' },
        }),
        stderr: '',
      };
    },
  };
}

async function environment(): Promise<HarnessConformanceEnvironment> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sothspell-codex-project-'));
  const home = await mkdtemp(path.join(os.tmpdir(), 'sothspell-codex-home-'));
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
    clientId: 'codex-client',
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

  const adapter = createCodexAdapter({
    cwd: projectRoot,
    host: fakeCodexHost(),
    openUrl: async (url) => {
      launches.push(url);
    },
    notify: async (message) => {
      notifications.push(message);
    },
  });

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

describe('Codex adapter', () => {
  it('declares the Codex identity and structured-output capability', () => {
    const adapter = createCodexAdapter({ host: fakeCodexHost() });

    expect(adapter.id).toBe('codex');
    expect(adapter.capabilities).toMatchObject({
      structuredOutput: true,
      textGeneration: true,
      browserLaunch: true,
      cancel: true,
    });
  });

  it('never passes the runtime default model id to the CLI', async () => {
    const calls: Array<{ args: string[] }> = [];
    const host: CodexHost = {
      async run(input) {
        calls.push({ args: input.args });
        return {
          code: 0,
          stdout: JSON.stringify({
            type: 'item.completed',
            item: { id: 'item_1', type: 'agent_message', text: 'ok' },
          }),
          stderr: '',
        };
      },
    };
    const adapter = createCodexAdapter({ host });
    const model = adapter.createModel({
      id: 'codex/default',
      signal: new AbortController().signal,
    });

    await model.generateText({ system: 'S', prompt: 'P' });

    expect(calls[0]?.args).not.toContain('--model');
  });

  it('resolves the model from an injected resolver before the environment', async () => {
    const calls: string[][] = [];
    const host: CodexHost = {
      async run(input) {
        calls.push(input.args);
        return {
          code: 0,
          stdout: JSON.stringify({
            type: 'item.completed',
            item: { id: 'item_1', type: 'agent_message', text: 'ok' },
          }),
          stderr: '',
        };
      },
    };
    const previous = process.env.SOTHSPELL_CODEX_MODEL;
    process.env.SOTHSPELL_CODEX_MODEL = 'from-env';
    try {
      const adapter = createCodexAdapter({ host, resolveModel: () => 'from-profile' });
      const model = adapter.createModel({
        id: 'codex/default',
        signal: new AbortController().signal,
      });
      await model.generateText({ system: 'S', prompt: 'P' });

      const args = calls[0] ?? [];
      const index = args.indexOf('--model');
      expect(args[index + 1]).toBe('from-profile');
    } finally {
      if (previous === undefined) {
        delete process.env.SOTHSPELL_CODEX_MODEL;
      } else {
        process.env.SOTHSPELL_CODEX_MODEL = previous;
      }
    }
  });

  it('falls back to SOTHSPELL_CODEX_MODEL when nothing else is configured', async () => {
    const calls: string[][] = [];
    const host: CodexHost = {
      async run(input) {
        calls.push(input.args);
        return {
          code: 0,
          stdout: JSON.stringify({
            type: 'item.completed',
            item: { id: 'item_1', type: 'agent_message', text: 'ok' },
          }),
          stderr: '',
        };
      },
    };
    const previous = process.env.SOTHSPELL_CODEX_MODEL;
    process.env.SOTHSPELL_CODEX_MODEL = 'from-env';
    try {
      const adapter = createCodexAdapter({ host });
      const model = adapter.createModel({
        id: 'codex/default',
        signal: new AbortController().signal,
      });
      await model.generateText({ system: 'S', prompt: 'P' });

      const args = calls[0] ?? [];
      const index = args.indexOf('--model');
      expect(args[index + 1]).toBe('from-env');
    } finally {
      if (previous === undefined) {
        delete process.env.SOTHSPELL_CODEX_MODEL;
      } else {
        process.env.SOTHSPELL_CODEX_MODEL = previous;
      }
    }
  });

  it('honours SOTHSPELL_PLAYER_URL when no player URL is configured', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sothspell-codex-project-'));
    const home = await mkdtemp(path.join(os.tmpdir(), 'sothspell-codex-home-'));
    const previous = process.env.SOTHSPELL_PLAYER_URL;
    process.env.SOTHSPELL_PLAYER_URL = 'http://127.0.0.1:9999';
    try {
      const runtime = createCodexRuntime({
        cwd: projectRoot,
        home,
        openUrl: async () => undefined,
      });
      await expect(runtime.open()).resolves.toEqual({
        playerUrl: 'http://127.0.0.1:9999',
      });
    } finally {
      if (previous === undefined) {
        delete process.env.SOTHSPELL_PLAYER_URL;
      } else {
        process.env.SOTHSPELL_PLAYER_URL = previous;
      }
      await rm(projectRoot, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe('Codex harness conformance', () => {
  for (const testCase of harnessConformanceCases(environment)) {
    it(testCase.name, testCase.run);
  }
});
