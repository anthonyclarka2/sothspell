import { formatAnswer, formatStatus } from './format.js';
import type { HarnessRuntime } from './types.js';

/**
 * The command surface every adapter CLI shares: `open`, `status`, `generate`,
 * `ask <question>`, and `cancel`. Hosts that have their own command registry
 * (OpenCode) call the runtime directly; hosts that shell out (Claude Code,
 * Codex) route their command through this one parser so the verbs behave the
 * same everywhere.
 */

export interface HarnessCommandIO {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

export const HARNESS_COMMAND_USAGE =
  'Usage: sothspell [open|status|generate|ask <question>|cancel]';

export interface HarnessCommandOptions {
  /** Open the browser after generate; the host CLI passes --no-open to skip. */
  autoOpen?: boolean;
}

export async function runHarnessCommand(
  runtime: HarnessRuntime,
  argv: string[],
  io: HarnessCommandIO,
  options: HarnessCommandOptions = {},
): Promise<number> {
  const flags = argv.filter((arg) => arg.startsWith('--'));
  const positionals = argv.filter((arg) => !arg.startsWith('--'));
  const autoOpen = options.autoOpen !== false && !flags.includes('--no-open');
  const [verb = 'open', ...rest] = positionals;

  if (verb === 'status') {
    io.stdout(formatStatus(await runtime.status()));
    return 0;
  }

  if (verb === 'ask') {
    const question = rest.join(' ').trim();
    if (question.length < 3) {
      io.stderr(`Usage: sothspell ask <question>`);
      return 2;
    }
    const result = await runtime.ask({ question });
    io.stdout(formatAnswer(result.answer));
    return 0;
  }

  if (verb === 'cancel') {
    await runtime.cancel();
    io.stdout('Cancelled any sóþspell generation in flight.');
    return 0;
  }

  if (verb !== 'open' && verb !== 'generate') {
    io.stderr(`Unknown command: ${verb}. ${HARNESS_COMMAND_USAGE}`);
    return 2;
  }

  const status = await runtime.status();
  if (verb === 'generate' || !status.tourId) {
    io.stderr('Generating a sóþspell for this project…');
    const unsubscribe = runtime.events.on((event) => {
      if (event.name === 'generation.progress') {
        const chapter =
          event.progress.chapterIndex === undefined
            ? ''
            : ` [${event.progress.chapterIndex + 1}]`;
        const detail = event.progress.detail ? ` — ${event.progress.detail}` : '';
        io.stderr(`  ${event.progress.stage}${chapter}${detail}`);
      }
    });
    try {
      const result = await runtime.generate({});
      io.stdout(`Tour ready: ${result.tourId}`);
      const url = autoOpen ? (await runtime.open()).playerUrl : result.playerUrl;
      io.stdout(`Player: ${url}${autoOpen ? '' : ' (open it in a browser)'}`);
    } finally {
      unsubscribe();
    }
    return 0;
  }

  const url = autoOpen ? (await runtime.open()).playerUrl : status.playerUrl;
  io.stdout(`Tour: ${status.tourId}`);
  io.stdout(
    `Run: ${status.run ? `${status.run.beatId}, ${status.run.completed} beat(s) completed` : 'no saved progress'}`,
  );
  io.stdout(`Player: ${url}${autoOpen ? '' : ' (open it in a browser)'}`);
  return 0;
}
