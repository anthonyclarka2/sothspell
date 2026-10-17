import { describe, expect, it, vi } from 'vitest';
import type { HarnessEvent, HarnessRuntime } from '@sothspell/harness';
import { runCodexCli, runCodexHook } from './cli.js';

function fakeRuntime(overrides: Partial<HarnessRuntime> = {}): HarnessRuntime {
  const listeners = new Set<(event: HarnessEvent) => void>();
  return {
    capabilities: {
      structuredOutput: true,
      textGeneration: true,
      notify: false,
      browserLaunch: true,
      cancel: true,
      backgroundGeneration: true,
    },
    events: {
      on(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    status: vi.fn(async () => ({
      projectRoot: '/repo',
      tourId: 'tour_demo',
      playerUrl: 'http://127.0.0.1:4319',
      run: { beatId: 'beat_one', completed: 1 },
    })),
    generate: vi.fn(async () => ({
      tourId: 'tour_demo',
      playerUrl: 'http://127.0.0.1:4319/t/tour_demo',
      quality: {},
    })),
    open: vi.fn(async () => ({ playerUrl: 'http://127.0.0.1:4319/t/tour_demo' })),
    progress: vi.fn(async () => ({ run: null })),
    ask: vi.fn(async () => ({ answer: { answer: { markdown: 'At the entry.' } } })),
    cancel: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
    ...overrides,
  };
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: (line: string) => stdout.push(line),
      stderr: (line: string) => stderr.push(line),
    },
    stdout,
    stderr,
  };
}

describe('Codex CLI', () => {
  it('announces an existing tour through the SessionStart hook', async () => {
    const { io, stdout } = capture();

    await expect(
      runCodexHook('session-start', io, {
        runtime: fakeRuntime(),
        stdin: async () =>
          JSON.stringify({ cwd: '/repo', hook_event_name: 'SessionStart' }),
      }),
    ).resolves.toBe(0);

    const payload = JSON.parse(stdout[0] ?? '{}') as {
      hookSpecificOutput?: { hookEventName?: string; additionalContext?: string };
    };
    expect(payload.hookSpecificOutput?.hookEventName).toBe('SessionStart');
    expect(payload.hookSpecificOutput?.additionalContext).toContain('tour_demo');
    expect(payload.hookSpecificOutput?.additionalContext).toContain(
      'http://127.0.0.1:4319/t/tour_demo',
    );
  });

  it('stays silent when no tour exists', async () => {
    const { io, stdout } = capture();

    await expect(
      runCodexHook('session-start', io, {
        runtime: fakeRuntime({
          status: vi.fn(async () => ({
            projectRoot: '/repo',
            tourId: null,
            playerUrl: 'http://127.0.0.1:4319',
            run: null,
          })),
        }),
        stdin: async () => '',
      }),
    ).resolves.toBe(0);

    expect(stdout).toEqual([]);
  });

  it('runs the shared generate verb', async () => {
    const { io, stdout, stderr } = capture();

    await expect(
      runCodexCli(['generate'], io, {
        runtime: fakeRuntime({
          status: vi.fn(async () => ({
            projectRoot: '/repo',
            tourId: null,
            playerUrl: 'http://127.0.0.1:4319',
            run: null,
          })),
        }),
      }),
    ).resolves.toBe(0);

    expect(stderr.join('\n')).toContain('Generating');
    expect(stdout.join('\n')).toContain('Tour ready: tour_demo');
  });

  it('returns 1 with a readable error when the runtime fails', async () => {
    const { io, stderr } = capture();

    await expect(
      runCodexCli(['ask', 'Where does it start?'], io, {
        runtime: fakeRuntime({
          ask: vi.fn(async () => {
            throw new Error('the local player is not reachable');
          }),
        }),
      }),
    ).resolves.toBe(1);

    expect(stderr.join('\n')).toContain('not reachable');
  });
});
