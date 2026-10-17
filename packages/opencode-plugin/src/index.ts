import { Plugin } from '@opencode/plugin';
import type { Context as PluginContext } from '@opencode/plugin/promise/plugin';
import { z } from 'zod';
import {
  AskInputSchema,
  AskOutputSchema,
  CancelOutputSchema,
  GenerateInputSchema,
  GenerateOutputSchema,
  OpenOutputSchema,
  ProgressOutputSchema,
  SothspellRpc,
  StatusOutputSchema,
  type SothspellStatusOutput,
} from './rpc.js';
import {
  completedBeatCount,
  createDefaultRuntime,
  DEFAULT_MAX_MINUTES,
  DEFAULT_PLAYER_URL,
  SothspellError,
  type DefaultRuntimeOptions,
  type GenerationProgress,
  type SothspellRuntime,
} from './runtime.js';

/**
 * The OpenCode V2 entrypoint. Commands, tools, and RPC all call one runtime
 * port; nothing in this module knows how a tour is authored or where the player
 * runs. That keeps the host adapter thin and the behavior testable with a fake.
 */

export const PluginOptionsSchema = z.object({
  playerUrl: z.string().url().default(DEFAULT_PLAYER_URL),
  serverPort: z.number().int().min(1).max(65535).default(4319),
  autoOpen: z.boolean().default(true),
  model: z.string().min(1).optional(),
  maxMinutes: z.number().int().min(1).max(120).default(DEFAULT_MAX_MINUTES),
});

export type SothspellPluginOptions = z.infer<typeof PluginOptionsSchema>;

export interface SetupDependencies {
  /** Tests and embedding hosts can replace the runtime entirely. */
  runtime?: SothspellRuntime;
  /** Captures the progress callback the setup wires to RPC events. */
  createRuntime?: (
    context: PluginContext,
    options: DefaultRuntimeOptions,
  ) => SothspellRuntime;
}

function parseOptions(
  options: Readonly<Record<string, unknown>>,
): SothspellPluginOptions {
  const parsed = PluginOptionsSchema.safeParse(options);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'options'}: ${issue.message}`)
      .join('; ');
    throw new Error(`invalid @sothspell/opencode-plugin options: ${issues}`);
  }
  return parsed.data;
}

function formatStatus(status: SothspellStatusOutput): string {
  const lines = [
    `Project: ${status.projectRoot}`,
    `Tour: ${status.tourId ?? 'none yet'}`,
    `Player: ${status.playerUrl}`,
  ];
  if (status.run) {
    lines.push(`Run: ${status.run.beatId}, ${status.run.completed} beat(s) completed`);
  } else {
    lines.push('Run: no saved progress');
  }
  return lines.join('\n');
}

function formatAnswer(answer: unknown): string {
  if (answer !== null && typeof answer === 'object') {
    const record = answer as {
      answer?: { markdown?: unknown };
      citations?: unknown;
    };
    if (typeof record.answer?.markdown === 'string') {
      const citations = Array.isArray(record.citations)
        ? record.citations
            .map((citation) => {
              if (citation === null || typeof citation !== 'object') {
                return null;
              }
              const entry = citation as { label?: unknown; path?: unknown };
              if (typeof entry.path !== 'string') {
                return null;
              }
              return `- ${typeof entry.label === 'string' ? entry.label : entry.path} (${entry.path})`;
            })
            .filter((line): line is string => line !== null)
        : [];
      return [
        record.answer.markdown,
        ...(citations.length > 0 ? ['', 'Citations:', ...citations] : []),
      ].join('\n');
    }
  }
  return JSON.stringify(answer, null, 2) ?? 'No answer returned.';
}

function commandArguments(text: string): string[] {
  return text
    .trim()
    .replace(/^\/sothspell\b/u, '')
    .trim()
    .split(/\s+/u)
    .filter((part) => part.length > 0);
}

export async function setupSothspell(
  context: PluginContext,
  dependencies: SetupDependencies = {},
): Promise<() => Promise<void>> {
  const options = parseOptions(context.options);

  let runtime: SothspellRuntime;
  let emitProgress: ((progress: GenerationProgress) => void) | null = null;

  const onProgress = (progress: GenerationProgress): void => {
    emitProgress?.(progress);
  };

  const rpcRegistration = await context.rpc.register(SothspellRpc, {
    status: async () => runtime.status(),
    open: async () => runtime.open(),
    generate: async (input, call) => {
      try {
        return await runtime.generate(input);
      } catch (error) {
        if (error instanceof SothspellError && error.code === 'generation_running') {
          return call.error('generation_running', error.message, {
            message: error.message,
          });
        }
        throw error;
      }
    },
    progress: async () => {
      const [result, status] = await Promise.all([runtime.progress(), runtime.status()]);
      const run =
        result.run !== null && typeof result.run === 'object'
          ? (result.run as { beatId?: unknown; completedBeatIds?: unknown })
          : null;
      await rpcRegistration.events.emit('run.updated', {
        tourId: status.tourId,
        beatId: typeof run?.beatId === 'string' ? run.beatId : null,
        completed: completedBeatCount(run?.completedBeatIds),
      });
      return result;
    },
    ask: async (input, call) => {
      try {
        return await runtime.ask(input);
      } catch (error) {
        if (error instanceof SothspellError && error.code === 'no_tour') {
          return call.error('no_tour', error.message, { message: error.message });
        }
        throw error;
      }
    },
    cancel: async () => {
      await runtime.cancel();
      return { ok: true };
    },
  });

  emitProgress = (progress) => {
    void rpcRegistration.events.emit('generation.progress', {
      stage: progress.stage,
      ...(progress.chapterIndex === undefined
        ? {}
        : { chapterIndex: progress.chapterIndex }),
      ...(progress.detail === undefined ? {} : { detail: progress.detail }),
    });
  };

  try {
    runtime =
      dependencies.runtime ??
      (dependencies.createRuntime ?? createDefaultRuntime)(context, {
        playerUrl: options.playerUrl,
        maxMinutes: options.maxMinutes,
        ...(options.model === undefined ? {} : { model: options.model }),
        onProgress,
      });
  } catch (error) {
    await rpcRegistration.dispose().catch(() => undefined);
    throw error;
  }

  const notify = async (sessionID: string, text: string): Promise<void> => {
    await context.session.synthetic({ sessionID, text });
  };

  const openPlayer = async (): Promise<string> => {
    const opened = await runtime.open();
    return opened.playerUrl;
  };

  let commandRegistration: Awaited<ReturnType<PluginContext['command']['transform']>>;
  let toolRegistration: Awaited<ReturnType<PluginContext['tool']['transform']>>;

  try {
    commandRegistration = await context.command.transform((editor) => {
      editor.add({
        name: 'sothspell',
        description:
          'Generate or open a sóþspell for this project. Use "status" for progress or "ask <question>" about the current beat.',
        execute: async ({ sessionID, prompt }) => {
          const [verb = 'open', ...rest] = commandArguments(prompt.text);

          if (verb === 'status') {
            await notify(sessionID, formatStatus(await runtime.status()));
            return;
          }

          if (verb === 'ask') {
            const question = rest.join(' ').trim();
            if (question.length < 3) {
              await notify(sessionID, 'Usage: /sothspell ask <question>');
              return;
            }
            try {
              const result = await runtime.ask({ question });
              await notify(sessionID, formatAnswer(result.answer));
            } catch (error) {
              await notify(
                sessionID,
                error instanceof Error ? error.message : String(error),
              );
            }
            return;
          }

          if (verb !== 'open' && verb !== 'generate') {
            await notify(
              sessionID,
              `Unknown subcommand: ${verb}. Use /sothspell, /sothspell status, or /sothspell ask <question>.`,
            );
            return;
          }

          const status = await runtime.status();
          if (verb === 'generate' || !status.tourId) {
            await notify(sessionID, 'Generating a sóþspell for this project…');
            try {
              const result = await runtime.generate({
                maxMinutes: options.maxMinutes,
              });
              const url = options.autoOpen ? await openPlayer() : result.playerUrl;
              await notify(
                sessionID,
                [`Tour ready: ${result.tourId}`, `Player: ${url}`].join('\n'),
              );
            } catch (error) {
              await notify(
                sessionID,
                error instanceof Error ? error.message : String(error),
              );
            }
            return;
          }

          const url = options.autoOpen ? await openPlayer() : status.playerUrl;
          await notify(
            sessionID,
            [
              `Tour: ${status.tourId}`,
              `Run: ${status.run ? `${status.run.beatId}, ${status.run.completed} beat(s) completed` : 'no saved progress'}`,
              `Player: ${url}${options.autoOpen ? '' : ' (open it in a browser)'}`,
            ].join('\n'),
          );
        },
      });
    });

    toolRegistration = await context.tool.transform((editor) => {
      editor.add({
        name: 'sothspell_status',
        description:
          'Show the current sóþspell tour, saved run progress, and player URL for this project. Use before opening or regenerating a tour.',
        input: z.object({}),
        output: StatusOutputSchema,
        execute: async () => {
          const status = await runtime.status();
          return { output: status, content: formatStatus(status) };
        },
      });

      editor.add({
        name: 'sothspell_open',
        description:
          'Open the Sóþspell browser player for this project. Generates nothing; use sothspell_generate first when no tour exists.',
        input: z.object({}),
        output: OpenOutputSchema,
        execute: async () => {
          const result = await runtime.open();
          return {
            output: result,
            content: `Sóþspell player: ${result.playerUrl}`,
          };
        },
      });

      editor.add({
        name: 'sothspell_generate',
        description:
          'Author a new sóþspell for the current project and save it under SOTHSPELL_HOME. This is a local, read-only analysis: it never writes to the project. Offer it when the user asks for a walkthrough.',
        input: GenerateInputSchema,
        output: GenerateOutputSchema,
        execute: async (input) => {
          const result = await runtime.generate(input);
          return {
            output: result,
            content: [`Tour: ${result.tourId}`, `Player: ${result.playerUrl}`].join('\n'),
          };
        },
      });

      editor.add({
        name: 'sothspell_ask',
        description:
          'Ask the guide a question about the current beat. Answers cite code in the tour. Requires an existing tour and a running player.',
        input: AskInputSchema,
        output: AskOutputSchema,
        execute: async (input) => {
          const result = await runtime.ask(input);
          return {
            output: result,
            content: formatAnswer(result.answer),
          };
        },
      });
    });
  } catch (error) {
    await rpcRegistration.dispose().catch(() => undefined);
    if (commandRegistration!) {
      await commandRegistration.dispose().catch(() => undefined);
    }
    throw error;
  }

  let disposed = false;
  return async () => {
    if (disposed) {
      return;
    }
    disposed = true;
    await runtime.cancel().catch(() => undefined);
    await rpcRegistration.dispose().catch(() => undefined);
    await commandRegistration.dispose().catch(() => undefined);
    await toolRegistration.dispose().catch(() => undefined);
  };
}

export const SothspellPlugin = Plugin.define({
  id: 'sothspell',
  async setup(context) {
    return setupSothspell(context);
  },
});

export { SothspellRpc, CancelOutputSchema, ProgressOutputSchema };
export default SothspellPlugin;
