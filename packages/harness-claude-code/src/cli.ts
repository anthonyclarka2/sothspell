import {
  runHarnessCommand,
  sessionStartHookOutput,
  type HarnessCommandIO,
  type HarnessRuntime,
} from '@sothspell/harness';
import { createClaudeCodeRuntime } from './adapter.js';

/**
 * The plugin script entrypoint. Claude Code's skill and hooks shell out to
 * `scripts/sothspell.sh`, which runs this CLI with the repository toolchain.
 * The verbs are the shared harness commands; `hook` handles the SessionStart
 * payload.
 */

export interface ClaudeCodeCliOptions {
  cwd?: string;
  runtime?: HarnessRuntime;
  /** Injectable stdin for tests; defaults to the process stream. */
  stdin?: () => Promise<string>;
}

/**
 * Plugin configuration arrives through the environment: Claude Code exports
 * `CLAUDE_PLUGIN_OPTION_<KEY>` for every `userConfig` value. Missing values
 * fall back to the runtime defaults (and `SOTHSPELL_*` environment variables).
 */
export function claudeCodeOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): {
  playerUrl?: string;
  model?: string;
} {
  const playerUrl = env.CLAUDE_PLUGIN_OPTION_PLAYER_URL;
  const model = env.CLAUDE_PLUGIN_OPTION_MODEL;
  return {
    ...(playerUrl ? { playerUrl } : {}),
    ...(model ? { model } : {}),
  };
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
 * and stays silent when there is none, so it never nags. It reads no player
 * progress, so it returns instantly even when `sothspell serve` is down.
 */
export async function runClaudeCodeHook(
  event: string | undefined,
  io: HarnessCommandIO,
  options: ClaudeCodeCliOptions = {},
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
    createClaudeCodeRuntime({
      cwd,
      ...claudeCodeOptionsFromEnv(),
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

export async function runClaudeCodeCli(
  argv: string[],
  io: HarnessCommandIO,
  options: ClaudeCodeCliOptions = {},
): Promise<number> {
  if (argv[0] === 'hook') {
    return runClaudeCodeHook(argv[1], io, options);
  }

  const runtime =
    options.runtime ??
    createClaudeCodeRuntime({
      cwd: options.cwd ?? process.cwd(),
      ...claudeCodeOptionsFromEnv(),
    });
  try {
    return await runHarnessCommand(runtime, argv, io);
  } catch (error) {
    io.stderr(`Error: ${errorMessage(error)}`);
    return 1;
  }
}
