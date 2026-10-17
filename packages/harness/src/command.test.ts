import { describe, expect, it, vi } from 'vitest';
import { runHarnessCommand } from './command.js';
import { formatAnswer, formatStatus } from './format.js';
import type { HarnessEvent, HarnessRuntime, HarnessStatus } from './types.js';

function fakeRuntime(overrides: Partial<HarnessRuntime> = {}): HarnessRuntime {
  const listeners = new Set<(event: HarnessEvent) => void>();
  const status: HarnessStatus = {
    projectRoot: '/repo',
    tourId: 'tour_demo',
    playerUrl: 'http://127.0.0.1:4319',
    run: { beatId: 'beat_one', completed: 2 },
  };
  return {
    capabilities: {
      structuredOutput: false,
      textGeneration: true,
      notify: false,
      browserLaunch: true,
      cancel: true,
      backgroundGeneration: false,
    },
    events: {
      on(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    status: vi.fn(async () => status),
    generate: vi.fn(async () => {
      for (const listener of listeners) {
        listener({ name: 'generation.progress', progress: { stage: 'analyzing' } });
      }
      return {
        tourId: 'tour_demo',
        playerUrl: 'http://127.0.0.1:4319/t/tour_demo',
        quality: {},
      };
    }),
    open: vi.fn(async () => ({ playerUrl: 'http://127.0.0.1:4319/t/tour_demo' })),
    progress: vi.fn(async () => ({ run: null })),
    ask: vi.fn(async () => ({
      answer: {
        answer: { markdown: 'It starts at the entry point.' },
        citations: [{ label: 'Entry', path: 'src/index.ts' }],
      },
    })),
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

describe('runHarnessCommand', () => {
  it('prints status without generating', async () => {
    const runtime = fakeRuntime();
    const { io, stdout } = capture();

    await expect(runHarnessCommand(runtime, ['status'], io)).resolves.toBe(0);

    expect(runtime.generate).not.toHaveBeenCalled();
    expect(stdout.join('\n')).toContain('Tour: tour_demo');
    expect(stdout.join('\n')).toContain('Run: beat_one, 2 beat(s) completed');
  });

  it('opens an existing tour by default', async () => {
    const runtime = fakeRuntime();
    const { io, stdout } = capture();

    await expect(runHarnessCommand(runtime, [], io)).resolves.toBe(0);

    expect(runtime.open).toHaveBeenCalledTimes(1);
    expect(runtime.generate).not.toHaveBeenCalled();
    expect(stdout.join('\n')).toContain('Player: http://127.0.0.1:4319/t/tour_demo');
  });

  it('generates when no tour exists and streams progress to stderr', async () => {
    const runtime = fakeRuntime({
      status: vi.fn(async () => ({
        projectRoot: '/repo',
        tourId: null,
        playerUrl: 'http://127.0.0.1:4319',
        run: null,
      })),
    });
    const { io, stdout, stderr } = capture();

    await expect(runHarnessCommand(runtime, ['generate'], io)).resolves.toBe(0);

    expect(runtime.generate).toHaveBeenCalledTimes(1);
    expect(runtime.open).toHaveBeenCalledTimes(1);
    expect(stderr.join('\n')).toContain('analyzing');
    expect(stdout.join('\n')).toContain('Tour ready: tour_demo');
  });

  it('respects --no-open', async () => {
    const runtime = fakeRuntime();
    const { io, stdout } = capture();

    await expect(runHarnessCommand(runtime, ['--no-open'], io)).resolves.toBe(0);

    expect(runtime.open).not.toHaveBeenCalled();
    expect(stdout.join('\n')).toContain('(open it in a browser)');
  });

  it('asks a question and prints citations', async () => {
    const runtime = fakeRuntime();
    const { io, stdout } = capture();

    await expect(
      runHarnessCommand(runtime, ['ask', 'Where', 'does', 'it', 'start?'], io),
    ).resolves.toBe(0);

    expect(runtime.ask).toHaveBeenCalledWith({ question: 'Where does it start?' });
    expect(stdout.join('\n')).toContain('It starts at the entry point.');
    expect(stdout.join('\n')).toContain('- Entry (src/index.ts)');
  });

  it('rejects a too-short question and an unknown verb', async () => {
    const runtime = fakeRuntime();
    const short = capture();
    await expect(runHarnessCommand(runtime, ['ask', 'hi'], short.io)).resolves.toBe(2);
    expect(short.stderr.join('\n')).toContain('ask <question>');

    const unknown = capture();
    await expect(runHarnessCommand(runtime, ['dance'], unknown.io)).resolves.toBe(2);
    expect(unknown.stderr.join('\n')).toContain('Unknown command: dance');
  });

  it('cancels an in-flight generation', async () => {
    const runtime = fakeRuntime();
    const { io, stdout } = capture();

    await expect(runHarnessCommand(runtime, ['cancel'], io)).resolves.toBe(0);

    expect(runtime.cancel).toHaveBeenCalledTimes(1);
    expect(stdout.join('\n')).toContain('Cancelled');
  });
});

describe('format', () => {
  it('renders an empty status without a run', () => {
    expect(
      formatStatus({
        projectRoot: '/repo',
        tourId: null,
        playerUrl: 'http://127.0.0.1:4319',
        run: null,
      }),
    ).toBe(
      [
        'Project: /repo',
        'Tour: none yet',
        'Player: http://127.0.0.1:4319',
        'Run: no saved progress',
      ].join('\n'),
    );
  });

  it('falls back to pretty JSON for an unknown answer shape', () => {
    expect(formatAnswer({ ok: true })).toBe('{\n  "ok": true\n}');
  });
});
