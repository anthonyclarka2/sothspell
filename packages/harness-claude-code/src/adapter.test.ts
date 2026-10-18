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
import { createClaudeCodeAdapter, createClaudeCodeRuntime } from './adapter.js';
import type { ClaudeCodeHost } from './host.js';

/**
 * The conformance suite with a fake Claude Code host. The host is the only
 * process seam, so the whole adapter — model translation, launch, notify, and
 * the shared runtime — runs without spawning the real CLI.
 */

const playerUrl = 'http://127.0.0.1:4319';

function fakeClaudeHost(): ClaudeCodeHost {
  return {
    async run() {
      return {
        code: 0,
        stdout: JSON.stringify({ result: '{}', structured_output: {} }),
        stderr: '',
      };
    },
  };
}

async function environment(): Promise<HarnessConformanceEnvironment> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sothspell-cc-project-'));
  const home = await mkdtemp(path.join(os.tmpdir(), 'sothspell-cc-home-'));
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
    clientId: 'claude-code-client',
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

  const adapter = createClaudeCodeAdapter({
    cwd: projectRoot,
    host: fakeClaudeHost(),
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

describe('Claude Code adapter', () => {
  it('declares the Claude Code identity and structured-output capability', () => {
    const adapter = createClaudeCodeAdapter({ host: fakeClaudeHost() });

    expect(adapter.id).toBe('claude-code');
    expect(adapter.capabilities).toMatchObject({
      structuredOutput: true,
      textGeneration: true,
      browserLaunch: true,
      cancel: true,
    });
  });

  it('never passes the runtime default model id to the CLI', async () => {
    const calls: Array<{ args: string[] }> = [];
    const host: ClaudeCodeHost = {
      async run(input) {
        calls.push({ args: input.args });
        return {
          code: 0,
          stdout: JSON.stringify({ result: 'ok' }),
          stderr: '',
        };
      },
    };
    const adapter = createClaudeCodeAdapter({ host });
    const model = adapter.createModel({
      id: 'claude-code/default',
      signal: new AbortController().signal,
    });

    await model.generateText({ system: 'S', prompt: 'P' });

    expect(calls[0]?.args).not.toContain('--model');
  });

  it('resolves the model from an injected resolver before the environment', async () => {
    const calls: string[][] = [];
    const host: ClaudeCodeHost = {
      async run(input) {
        calls.push(input.args);
        return {
          code: 0,
          stdout: JSON.stringify({ result: 'ok' }),
          stderr: '',
        };
      },
    };
    const previous = process.env.SOTHSPELL_CLAUDE_MODEL;
    process.env.SOTHSPELL_CLAUDE_MODEL = 'from-env';
    try {
      const adapter = createClaudeCodeAdapter({
        host,
        resolveModel: () => 'from-profile',
      });
      const model = adapter.createModel({
        id: 'claude-code/default',
        signal: new AbortController().signal,
      });
      await model.generateText({ system: 'S', prompt: 'P' });

      const args = calls[0] ?? [];
      const index = args.indexOf('--model');
      expect(args[index + 1]).toBe('from-profile');
    } finally {
      if (previous === undefined) {
        delete process.env.SOTHSPELL_CLAUDE_MODEL;
      } else {
        process.env.SOTHSPELL_CLAUDE_MODEL = previous;
      }
    }
  });

  it('falls back to SOTHSPELL_CLAUDE_MODEL when nothing else is configured', async () => {
    const calls: string[][] = [];
    const host: ClaudeCodeHost = {
      async run(input) {
        calls.push(input.args);
        return {
          code: 0,
          stdout: JSON.stringify({ result: 'ok' }),
          stderr: '',
        };
      },
    };
    const previous = process.env.SOTHSPELL_CLAUDE_MODEL;
    process.env.SOTHSPELL_CLAUDE_MODEL = 'from-env';
    try {
      const adapter = createClaudeCodeAdapter({ host });
      const model = adapter.createModel({
        id: 'claude-code/default',
        signal: new AbortController().signal,
      });
      await model.generateText({ system: 'S', prompt: 'P' });

      const args = calls[0] ?? [];
      const index = args.indexOf('--model');
      expect(args[index + 1]).toBe('from-env');
    } finally {
      if (previous === undefined) {
        delete process.env.SOTHSPELL_CLAUDE_MODEL;
      } else {
        process.env.SOTHSPELL_CLAUDE_MODEL = previous;
      }
    }
  });

  it('honours SOTHSPELL_PLAYER_URL when no player URL is configured', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'sothspell-cc-project-'));
    const home = await mkdtemp(path.join(os.tmpdir(), 'sothspell-cc-home-'));
    const previous = process.env.SOTHSPELL_PLAYER_URL;
    process.env.SOTHSPELL_PLAYER_URL = 'http://127.0.0.1:9999';
    try {
      const runtime = createClaudeCodeRuntime({
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

describe('Claude Code harness conformance', () => {
  for (const testCase of harnessConformanceCases(environment)) {
    it(testCase.name, testCase.run);
  }
});
