import { z } from 'zod';
import type { GuideModel } from '@sothspell/authoring';
import { createTextGuideModel, parseJson } from '@sothspell/harness';
import type { ClaudeCodeHost } from './host.js';

/**
 * A `GuideModel` backed by `claude -p --output-format json`. The CLI exposes
 * schema-validated structured output through `--json-schema`, so the adapter
 * offers that path first and falls back to the shared text repair loop when the
 * host returns text instead. It never reads a provider key of its own.
 *
 * Researched against the Claude Code CLI reference and headless guide
 * (code.claude.com/docs, Claude Code v2.1.x, 2026-10-17): `-p` runs
 * non-interactively, `--output-format json` returns `{ result, structured_output,
 * session_id, ... }`, and `--json-schema` requests a validated object.
 */

/** The subset of the `claude -p --output-format json` payload this adapter reads. */
export interface ClaudeCodeResult {
  result?: unknown;
  structured_output?: unknown;
  is_error?: unknown;
  subtype?: unknown;
}

export interface ClaudeCodeGuideModelOptions {
  host: ClaudeCodeHost;
  id: string;
  /** Host model id or alias; omitted means the CLI's configured model. */
  model?: string | undefined;
  cwd?: string | undefined;
  signal?: AbortSignal | undefined;
  maxRepairAttempts?: number | undefined;
  /** Extra argv for the CLI, for example `['--bare']`. */
  extraArgs?: string[] | undefined;
}

export function parseClaudeCodeResult(stdout: string): ClaudeCodeResult {
  try {
    const parsed = JSON.parse(stdout.trim()) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      return parsed as ClaudeCodeResult;
    }
  } catch {
    // Fall through to the named error below.
  }
  throw new Error(
    `claude did not return JSON; run \`claude -p --output-format json\` to check the installation`,
  );
}

function resultText(payload: ClaudeCodeResult): string {
  if (typeof payload.result === 'string') {
    return payload.result;
  }
  if (payload.structured_output !== undefined) {
    return JSON.stringify(payload.structured_output);
  }
  return '';
}

export function createClaudeCodeGuideModel(
  options: ClaudeCodeGuideModelOptions,
): GuideModel {
  const run = async (input: {
    system: string;
    prompt: string;
    schemaJson?: string;
    signal?: AbortSignal;
  }): Promise<ClaudeCodeResult> => {
    input.signal?.throwIfAborted();
    const args = [
      '-p',
      '--output-format',
      'json',
      '--append-system-prompt',
      input.system,
      ...(options.model === undefined ? [] : ['--model', options.model]),
      ...(input.schemaJson === undefined ? [] : ['--json-schema', input.schemaJson]),
      ...(options.extraArgs ?? []),
      input.prompt,
    ];
    const result = await options.host.run({
      args,
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    input.signal?.throwIfAborted();
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout).trim().slice(0, 2000);
      throw new Error(
        `claude exited with code ${result.code}${detail ? `: ${detail}` : ''}`,
      );
    }
    return parseClaudeCodeResult(result.stdout);
  };

  return createTextGuideModel(
    {
      async generateText(input) {
        const payload = await run({
          system: input.system,
          prompt: input.prompt,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
        return resultText(payload);
      },
      async generateObject(input) {
        const schemaJson = JSON.stringify(
          z.toJSONSchema(input.schema, { unrepresentable: 'any' }),
        );
        const payload = await run({
          system: [
            input.system,
            'Respond with exactly one JSON object and no other text.',
          ].join('\n\n'),
          prompt: input.prompt,
          schemaJson,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
        if (payload.structured_output !== undefined) {
          return payload.structured_output;
        }
        // No structured output: parse the text when it is JSON so the shared
        // model can validate it without a second CLI run; otherwise return the
        // raw text and let the bounded repair loop take over.
        const text = resultText(payload);
        try {
          return parseJson(text);
        } catch {
          return text;
        }
      },
    },
    {
      id: options.id,
      ...(options.maxRepairAttempts === undefined
        ? {}
        : { maxRepairAttempts: options.maxRepairAttempts }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
  );
}
