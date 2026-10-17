import {
  runHarnessCommand,
  sessionStartHookOutput,
  type HarnessCommandIO,
  type HarnessRuntime,
} from '@sothspell/harness';
import { createCodexRuntime } from './adapter.js';

/**
 * The plugin script entrypoint. The Codex skill and hooks shell out to
 * `scripts/sothspell.sh`, which runs this CLI with the repository toolchain.
 * The verbs are the shared harness commands; `hook` handles the SessionStart
 * payload (Codex uses the same `hookSpecificOutput` shape as Claude Code).
 */

export interface CodexCliOptions {
  cwd?: string;
  runtime?: HarnessRuntime;
  /** Injectable stdin for tests; defaults to the process stream. */
  stdin?: () => Promise<string>;
}

async function readStdin(): Promise<string> {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return data;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * SessionStart hook. It announces an existing tour through `additionalContext`
 * and stays silent when there is none. It reads no player progress, so it
 * returns instantly even when `sothspell serve` is down.
 */
export async function runCodexHook(
  event: string | undefined,
  io: HarnessCommandIO,
  options: CodexCliOptions = {},
): Promise<number> {
  if (event !== 'session-start') {
    io.stderr(`unknown hook: ${event ?? '(none)'}; expected session-start`);
    return 2;
  }

  let payload: { cwd?: unknown } = {};
  try {
    const raw = await (options.stdin ?? readStdin)();
    if (raw.trim().length > 0) {
      payload = JSON.parse(raw) as { cwd?: unknown };
    }
  } catch {
    // A hook without a JSON payload still runs against the current directory.
  }

  const cwd =
    typeof payload.cwd === 'string' ? payload.cwd : (options.cwd ?? process.cwd());
  const runtime =
    options.runtime ??
    createCodexRuntime({
      cwd,
      // The hook must not wait on a closed player port.
      fetch: async () => {
        throw new Error('the session-start hook does not read player progress');
      },
    });

  const status = await runtime.status();
  const output = sessionStartHookOutput(status);
  if (output !== null) {
    io.stdout(output);
  }
  return 0;
}

export async function runCodexCli(
  argv: string[],
  io: HarnessCommandIO,
  options: CodexCliOptions = {},
): Promise<number> {
  if (argv[0] === 'hook') {
    return runCodexHook(argv[1], io, options);
  }

  const runtime =
    options.runtime ?? createCodexRuntime({ cwd: options.cwd ?? process.cwd() });
  try {
    return await runHarnessCommand(runtime, argv, io);
  } catch (error) {
    io.stderr(`Error: ${errorMessage(error)}`);
    return 1;
  }
}
