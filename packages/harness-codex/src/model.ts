import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { GuideModel } from '@sothspell/authoring';
import { createTextGuideModel, parseJson } from '@sothspell/harness';
import type { CodexHost } from './host.js';

/**
 * A `GuideModel` backed by `codex exec`. Codex streams JSONL events with
 * `--json`; the adapter reads the final `item.completed` agent message and uses
 * `--output-schema` for schema-validated structured output, falling back to the
 * shared text repair loop. Codex runs read-only by default, which matches the
 * read-only promise for authoring.
 *
 * Researched against the Codex non-interactive guide and hooks reference
 * (developers.openai.com/codex, 2026-10-17): `codex exec` prints progress to
 * stderr and the final message to stdout, `--json` switches stdout to JSONL
 * (`thread.started`, `turn.*`, `item.*`), `--output-schema <file>` requests a
 * final response matching a JSON Schema, and `-` reads the prompt from stdin.
 */

export interface CodexEvent {
  type?: unknown;
  item?: { type?: unknown; text?: unknown };
}

export function parseCodexEvents(stdout: string): CodexEvent[] {
  const events: CodexEvent[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed !== null && typeof parsed === 'object') {
        events.push(parsed as CodexEvent);
      }
    } catch {
      // Progress noise on stdout is ignored; the agent message is what matters.
    }
  }
  return events;
}

/** The text of the last `item.completed` agent message in a JSONL stream. */
export function lastAgentMessage(stdout: string): string | null {
  let message: string | null = null;
  for (const event of parseCodexEvents(stdout)) {
    if (
      event.type === 'item.completed' &&
      event.item?.type === 'agent_message' &&
      typeof event.item.text === 'string'
    ) {
      message = event.item.text;
    }
  }
  return message;
}

export interface CodexGuideModelOptions {
  host: CodexHost;
  id: string;
  /** Host model id or slug; omitted means the CLI's configured model. */
  model?: string | undefined;
  cwd?: string | undefined;
  signal?: AbortSignal | undefined;
  maxRepairAttempts?: number | undefined;
  /** Extra argv for `codex exec`, for example `['--ignore-user-config']`. */
  extraArgs?: string[] | undefined;
  /** Where schema files are written; defaults to the OS temp directory. */
  workDirectory?: string | undefined;
}

export function createCodexGuideModel(options: CodexGuideModelOptions): GuideModel {
  let schemaCounter = 0;

  const run = async (input: {
    system: string;
    prompt: string;
    schemaJson?: string;
    signal?: AbortSignal;
  }): Promise<string> => {
    input.signal?.throwIfAborted();

    let schemaPath: string | undefined;
    if (input.schemaJson !== undefined) {
      const directory = options.workDirectory ?? os.tmpdir();
      await mkdir(directory, { recursive: true });
      schemaPath = path.join(
        directory,
        `sothspell-schema-${process.pid}-${schemaCounter}.json`,
      );
      schemaCounter += 1;
      await writeFile(schemaPath, `${input.schemaJson}\n`, 'utf8');
    }

    const args = [
      'exec',
      '--json',
      '--ephemeral',
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
      ...(options.model === undefined ? [] : ['--model', options.model]),
      ...(schemaPath === undefined ? [] : ['--output-schema', schemaPath]),
      ...(options.extraArgs ?? []),
      '-',
    ];
    const result = await options.host.run({
      args,
      stdin: `${input.system}\n\n${input.prompt}`,
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    input.signal?.throwIfAborted();
    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout).trim().slice(0, 2000);
      throw new Error(
        `codex exited with code ${result.code}${detail ? `: ${detail}` : ''}`,
      );
    }

    const message = lastAgentMessage(result.stdout);
    if (message === null) {
      throw new Error(
        'codex did not emit an agent message; run `codex exec --json "hello"` to check the installation',
      );
    }
    return message;
  };

  return createTextGuideModel(
    {
      async generateText(input) {
        return run({
          system: input.system,
          prompt: input.prompt,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
      },
      async generateObject(input) {
        const schemaJson = JSON.stringify(
          z.toJSONSchema(input.schema, { unrepresentable: 'any' }),
        );
        const text = await run({
          system: [
            input.system,
            'Respond with exactly one JSON object and no other text.',
          ].join('\n\n'),
          prompt: input.prompt,
          schemaJson,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
        // The shared model validates the parsed value and repairs if needed.
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
