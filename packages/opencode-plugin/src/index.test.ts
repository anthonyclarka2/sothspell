import { describe, expect, it, vi } from 'vitest';
import type { Context as PluginContext } from '@opencode/plugin/promise/plugin';
import { SothspellPlugin, setupSothspell, type SetupDependencies } from './index.js';
import type {
  DefaultRuntimeOptions,
  SothspellRuntime,
  SothspellStatus,
} from './runtime.js';
import { SothspellError } from './runtime.js';
import { SothspellRpc } from './rpc.js';

interface CapturedCommand {
  name: string;
  description?: string;
  execute(input: {
    sessionID: string;
    prompt: { text: string };
    delivery: 'steer' | 'queue';
  }): Promise<void>;
}

interface CapturedTool {
  name: string;
  description: string;
  execute(
    input: unknown,
    context: { signal: AbortSignal },
  ): Promise<{ output?: unknown; content?: unknown }>;
}

type CapturedHandler = (
  input: unknown,
  context: {
    signal: AbortSignal;
    error: (type: string, message: string, data?: unknown) => unknown;
  },
) => Promise<unknown>;

interface FakeContextResult {
  context: PluginContext;
  commands: Map<string, CapturedCommand>;
  tools: Map<string, CapturedTool>;
  handlers: Map<string, CapturedHandler>;
  events: Array<{ name: string; data: unknown }>;
  synthetic: Array<{ sessionID: string; text: string }>;
  disposals: string[];
}

function fakeContext(options: Record<string, unknown> = {}): FakeContextResult {
  const commands = new Map<string, CapturedCommand>();
  const tools = new Map<string, CapturedTool>();
  const handlers = new Map<string, CapturedHandler>();
  const events: Array<{ name: string; data: unknown }> = [];
  const synthetic: Array<{ sessionID: string; text: string }> = [];
  const disposals: string[] = [];

  const context = {
    options,
    location: { directory: '/repo' },
    generate: {
      text: async () => ({ text: '{}' }),
    },
    session: {
      async synthetic(input: { sessionID: string; text: string }) {
        synthetic.push(input);
        return { id: 'message' };
      },
      async generate() {
        return { text: '{}' };
      },
    },
    rpc: {
      async register(_definition: unknown, registered: Record<string, CapturedHandler>) {
        for (const [name, handler] of Object.entries(registered)) {
          handlers.set(name, handler);
        }
        return {
          dispose: async () => {
            disposals.push('rpc');
          },
          events: {
            async emit(name: string, data: unknown) {
              events.push({ name, data });
            },
          },
        };
      },
    },
    command: {
      async transform(
        callback: (editor: { add: (command: CapturedCommand) => void }) => void,
      ) {
        callback({
          add: (command) => {
            commands.set(command.name, command);
          },
        });
        return {
          dispose: async () => {
            disposals.push('command');
          },
        };
      },
    },
    tool: {
      async transform(callback: (editor: { add: (tool: CapturedTool) => void }) => void) {
        callback({
          add: (tool) => {
            tools.set(tool.name, tool);
          },
        });
        return {
          dispose: async () => {
            disposals.push('tool');
          },
        };
      },
    },
  };

  return {
    context: context as unknown as PluginContext,
    commands,
    tools,
    handlers,
    events,
    synthetic,
    disposals,
  };
}

function status(overrides: Partial<SothspellStatus> = {}): SothspellStatus {
  return {
    projectRoot: '/repo',
    tourId: 'tour_demo',
    playerUrl: 'http://127.0.0.1:5173',
    run: { beatId: 'beat_one', completed: 2 },
    ...overrides,
  };
}

function fakeRuntime(overrides: Partial<SothspellRuntime> = {}): SothspellRuntime {
  return {
    status: vi.fn(async () => status()),
    generate: vi.fn(async () => ({
      tourId: 'tour_demo',
      playerUrl: 'http://127.0.0.1:5173',
      quality: { chapters: 1 },
    })),
    open: vi.fn(async () => ({ playerUrl: 'http://127.0.0.1:5173' })),
    progress: vi.fn(async () => ({
      run: {
        beatId: 'beat_one',
        completedBeatIds: ['beat_one', 'beat_two'],
      },
    })),
    ask: vi.fn(async () => ({
      answer: {
        answer: { markdown: 'It starts at the entry point.', citations: [] },
        citations: [{ id: 'anchor_entry', label: 'Entry', path: 'src/index.ts' }],
      },
    })),
    cancel: vi.fn(async () => undefined),
    ...overrides,
  };
}

function callContext() {
  return {
    signal: new AbortController().signal,
    error: (type: string, message: string, data?: unknown) => ({
      __error: true,
      type,
      message,
      data,
    }),
  };
}

describe('Sothspell plugin definition', () => {
  it('has the V2 id and setup function without a host', () => {
    expect(SothspellPlugin.id).toBe('sothspell');
    expect(typeof SothspellPlugin.setup).toBe('function');
  });

  it('registers one command and the four agent tools', async () => {
    const fake = fakeContext();
    const runtime = fakeRuntime();
    const cleanup = await setupSothspell(fake.context, { runtime });

    expect([...fake.commands.keys()]).toEqual(['sothspell']);
    expect(fake.commands.get('sothspell')?.description).toContain('status');
    expect([...fake.tools.keys()].toSorted()).toEqual([
      'sothspell_ask',
      'sothspell_generate',
      'sothspell_open',
      'sothspell_status',
    ]);
    expect(fake.tools.get('sothspell_generate')?.description).toContain(
      'never writes to the project',
    );

    await cleanup();
  });

  it('rejects invalid plugin options with a useful message', async () => {
    const fake = fakeContext({ maxMinutes: 0 });
    await expect(
      setupSothspell(fake.context, { runtime: fakeRuntime() }),
    ).rejects.toThrow('maxMinutes');
    expect(fake.disposals).toEqual([]);
  });

  it('disposes registrations and cancels generation once on cleanup', async () => {
    const fake = fakeContext();
    const runtime = fakeRuntime();
    const cleanup = await setupSothspell(fake.context, { runtime });

    await cleanup();
    await cleanup();

    expect(runtime.cancel).toHaveBeenCalledTimes(1);
    expect(fake.disposals).toEqual(['rpc', 'command', 'tool']);
  });

  it('wires generation progress to the RPC event', async () => {
    const fake = fakeContext();
    let captured: DefaultRuntimeOptions | undefined;
    const dependencies: SetupDependencies = {
      createRuntime: (_context, options) => {
        captured = options;
        return fakeRuntime();
      },
    };
    const cleanup = await setupSothspell(fake.context, dependencies);

    captured?.onProgress?.({ stage: 'chapter', chapterIndex: 1, detail: 'Entry' });
    await vi.waitFor(() => expect(fake.events).toHaveLength(1));
    expect(fake.events[0]).toEqual({
      name: 'generation.progress',
      data: { stage: 'chapter', chapterIndex: 1, detail: 'Entry' },
    });

    await cleanup();
  });
});

describe('/sothspell command', () => {
  it('shows status without generating', async () => {
    const fake = fakeContext();
    const runtime = fakeRuntime();
    const cleanup = await setupSothspell(fake.context, { runtime });
    const command = fake.commands.get('sothspell');
    if (!command) {
      throw new Error('command not registered');
    }

    await command.execute({
      sessionID: 'ses_test',
      prompt: { text: 'status' },
      delivery: 'steer',
    });

    expect(runtime.status).toHaveBeenCalledTimes(1);
    expect(runtime.generate).not.toHaveBeenCalled();
    expect(fake.synthetic[0]?.text).toContain('Tour: tour_demo');
    expect(fake.synthetic[0]?.text).toContain('Run: beat_one, 2 beat(s) completed');

    await cleanup();
  });

  it('opens an existing tour', async () => {
    const fake = fakeContext();
    const runtime = fakeRuntime();
    const cleanup = await setupSothspell(fake.context, { runtime });
    const command = fake.commands.get('sothspell');
    if (!command) {
      throw new Error('command not registered');
    }

    await command.execute({
      sessionID: 'ses_test',
      prompt: { text: '' },
      delivery: 'steer',
    });

    expect(runtime.open).toHaveBeenCalledTimes(1);
    expect(runtime.generate).not.toHaveBeenCalled();
    expect(fake.synthetic[0]?.text).toContain('Player: http://127.0.0.1:5173');

    await cleanup();
  });

  it('generates and then opens when no tour exists', async () => {
    const fake = fakeContext();
    const runtime = fakeRuntime({
      status: vi.fn(async () => status({ tourId: null, run: null })),
    });
    const cleanup = await setupSothspell(fake.context, { runtime });
    const command = fake.commands.get('sothspell');
    if (!command) {
      throw new Error('command not registered');
    }

    await command.execute({
      sessionID: 'ses_test',
      prompt: { text: 'generate' },
      delivery: 'steer',
    });

    expect(runtime.generate).toHaveBeenCalledWith({ maxMinutes: 12 });
    expect(runtime.open).toHaveBeenCalledTimes(1);
    expect(fake.synthetic.at(-1)?.text).toContain('Tour ready: tour_demo');

    await cleanup();
  });

  it('regenerates when generate is explicit', async () => {
    const fake = fakeContext({ autoOpen: false });
    const runtime = fakeRuntime();
    const cleanup = await setupSothspell(fake.context, { runtime });
    const command = fake.commands.get('sothspell');
    if (!command) {
      throw new Error('command not registered');
    }

    await command.execute({
      sessionID: 'ses_test',
      prompt: { text: 'generate' },
      delivery: 'steer',
    });

    expect(runtime.generate).toHaveBeenCalledTimes(1);
    expect(runtime.open).not.toHaveBeenCalled();

    await cleanup();
  });

  it('respects autoOpen=false', async () => {
    const fake = fakeContext({ autoOpen: false });
    const runtime = fakeRuntime();
    const cleanup = await setupSothspell(fake.context, { runtime });
    const command = fake.commands.get('sothspell');
    if (!command) {
      throw new Error('command not registered');
    }

    await command.execute({
      sessionID: 'ses_test',
      prompt: { text: 'open' },
      delivery: 'steer',
    });

    expect(runtime.open).not.toHaveBeenCalled();
    expect(fake.synthetic[0]?.text).toContain('open it in a browser');

    await cleanup();
  });

  it('asks at the current beat and prints citations', async () => {
    const fake = fakeContext();
    const runtime = fakeRuntime();
    const cleanup = await setupSothspell(fake.context, { runtime });
    const command = fake.commands.get('sothspell');
    if (!command) {
      throw new Error('command not registered');
    }

    await command.execute({
      sessionID: 'ses_test',
      prompt: { text: 'ask Where does it start?' },
      delivery: 'steer',
    });

    expect(runtime.ask).toHaveBeenCalledWith({
      question: 'Where does it start?',
    });
    expect(fake.synthetic[0]?.text).toContain('It starts at the entry point.');
    expect(fake.synthetic[0]?.text).toContain('Entry (src/index.ts)');

    await cleanup();
  });

  it('reports a runtime error instead of rejecting the command', async () => {
    const fake = fakeContext();
    const runtime = fakeRuntime({
      ask: vi.fn(async () => {
        throw new SothspellError('no_tour', 'run /sothspell first');
      }),
    });
    const cleanup = await setupSothspell(fake.context, { runtime });
    const command = fake.commands.get('sothspell');
    if (!command) {
      throw new Error('command not registered');
    }

    await command.execute({
      sessionID: 'ses_test',
      prompt: { text: 'ask what is this?' },
      delivery: 'steer',
    });

    expect(fake.synthetic[0]?.text).toBe('run /sothspell first');

    await cleanup();
  });
});

describe('agent tools', () => {
  it('returns typed outputs and readable content', async () => {
    const fake = fakeContext();
    const runtime = fakeRuntime();
    const cleanup = await setupSothspell(fake.context, { runtime });

    const statusTool = fake.tools.get('sothspell_status');
    const openTool = fake.tools.get('sothspell_open');
    const generateTool = fake.tools.get('sothspell_generate');
    const askTool = fake.tools.get('sothspell_ask');
    if (!statusTool || !openTool || !generateTool || !askTool) {
      throw new Error('tools not registered');
    }

    const context = { signal: new AbortController().signal };
    await expect(statusTool.execute({}, context)).resolves.toMatchObject({
      output: { tourId: 'tour_demo' },
      content: expect.stringContaining('Tour: tour_demo'),
    });
    await expect(openTool.execute({}, context)).resolves.toMatchObject({
      output: { playerUrl: 'http://127.0.0.1:5173' },
    });
    await expect(generateTool.execute({ maxMinutes: 5 }, context)).resolves.toMatchObject(
      {
        output: { tourId: 'tour_demo' },
      },
    );
    expect(runtime.generate).toHaveBeenCalledWith({ maxMinutes: 5 });
    await expect(
      askTool.execute({ question: 'Where does it start?' }, context),
    ).resolves.toMatchObject({
      output: { answer: { answer: { markdown: 'It starts at the entry point.' } } },
    });

    await cleanup();
  });
});

describe('RPC handlers', () => {
  it('returns the runtime shapes for every method', async () => {
    const fake = fakeContext();
    const runtime = fakeRuntime();
    const cleanup = await setupSothspell(fake.context, { runtime });
    const call = callContext();

    await expect(fake.handlers.get('status')?.({}, call)).resolves.toMatchObject({
      tourId: 'tour_demo',
    });
    await expect(fake.handlers.get('open')?.({}, call)).resolves.toEqual({
      playerUrl: 'http://127.0.0.1:5173',
    });
    await expect(
      fake.handlers.get('generate')?.({ maxMinutes: 4 }, call),
    ).resolves.toMatchObject({ tourId: 'tour_demo' });
    await expect(fake.handlers.get('progress')?.({}, call)).resolves.toMatchObject({
      run: { beatId: 'beat_one' },
    });
    await expect(
      fake.handlers.get('ask')?.({ question: 'Where?' }, call),
    ).resolves.toMatchObject({ answer: { answer: { citations: [] } } });
    await expect(fake.handlers.get('cancel')?.({}, call)).resolves.toEqual({
      ok: true,
    });
    expect(runtime.cancel).toHaveBeenCalledTimes(1);

    await cleanup();
  });

  it('emits run.updated with the tour and beat progress', async () => {
    const fake = fakeContext();
    const runtime = fakeRuntime();
    const cleanup = await setupSothspell(fake.context, { runtime });

    await fake.handlers.get('progress')?.({}, callContext());
    await vi.waitFor(() => expect(fake.events).toHaveLength(1));
    expect(fake.events[0]).toEqual({
      name: 'run.updated',
      data: { tourId: 'tour_demo', beatId: 'beat_one', completed: 2 },
    });

    await cleanup();
  });

  it('maps declared runtime failures to RPC errors', async () => {
    const fake = fakeContext();
    const runtime = fakeRuntime({
      generate: vi.fn(async () => {
        throw new SothspellError('generation_running', 'already running');
      }),
      ask: vi.fn(async () => {
        throw new SothspellError('no_tour', 'no tour yet');
      }),
    });
    const cleanup = await setupSothspell(fake.context, { runtime });
    const call = callContext();

    await expect(fake.handlers.get('generate')?.({}, call)).resolves.toMatchObject({
      __error: true,
      type: 'generation_running',
      data: { message: 'already running' },
    });
    await expect(
      fake.handlers.get('ask')?.({ question: 'why?' }, call),
    ).resolves.toMatchObject({
      __error: true,
      type: 'no_tour',
      data: { message: 'no tour yet' },
    });

    await cleanup();
  });

  it('exposes the same definition the plugin registers', () => {
    expect(SothspellRpc.id).toBe('sothspell');
  });
});
