import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { CodexHost, CodexHostRunInput } from './host.js';
import { createCodexGuideModel, lastAgentMessage, parseCodexEvents } from './model.js';

const PersonSchema = z.object({
  name: z.string().min(1),
  count: z.number().int().min(0),
});

const request = {
  schema: PersonSchema,
  schemaName: 'Person',
  system: 'You are a guide.',
  prompt: 'Write a person.',
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function workDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sothspell-codex-'));
  temporaryDirectories.push(directory);
  return directory;
}

function jsonl(messages: string[]): string {
  const events: unknown[] = [
    { type: 'thread.started', thread_id: 'thread_1' },
    { type: 'turn.started' },
    ...messages.map((text, index) => ({
      type: 'item.completed',
      item: { id: `item_${index}`, type: 'agent_message', text },
    })),
    { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } },
  ];
  return events.map((event) => JSON.stringify(event)).join('\n');
}

interface FakeResponse {
  code?: number;
  stdout?: string;
  stderr?: string;
}

function fakeHost(responses: FakeResponse[]) {
  const calls: CodexHostRunInput[] = [];
  let index = 0;
  const host: CodexHost = {
    async run(input) {
      calls.push(input);
      const response = responses[Math.min(index, responses.length - 1)] ?? {};
      index += 1;
      return {
        code: response.code ?? 0,
        stdout: response.stdout ?? jsonl(['{}']),
        stderr: response.stderr ?? '',
      };
    },
  };
  return { host, calls };
}

describe('Codex event parsing', () => {
  it('reads the last agent message from a JSONL stream', () => {
    const stdout = jsonl(['first', 'second']);
    expect(lastAgentMessage(stdout)).toBe('second');
    expect(parseCodexEvents(stdout)).toHaveLength(5);
  });

  it('returns null when no agent message exists', () => {
    expect(lastAgentMessage('not json\n{"type":"turn.started"}')).toBeNull();
  });
});

describe('CodexGuideModel', () => {
  it('runs codex exec read-only with the prompt on stdin', async () => {
    const { host, calls } = fakeHost([{ stdout: jsonl(['hello']) }]);
    const model = createCodexGuideModel({ host, id: 'codex/default' });

    await expect(model.generateText({ system: 'S', prompt: 'P' })).resolves.toEqual({
      text: 'hello',
    });

    const args = calls[0]?.args ?? [];
    expect(args.slice(0, 6)).toEqual([
      'exec',
      '--json',
      '--ephemeral',
      '--sandbox',
      'read-only',
      '--skip-git-repo-check',
    ]);
    expect(args.at(-1)).toBe('-');
    expect(calls[0]?.stdin).toBe('S\n\nP');
    expect(args).not.toContain('--model');
  });

  it('writes the schema and asks for validated output', async () => {
    const directory = await workDirectory();
    const { host, calls } = fakeHost([{ stdout: jsonl(['{"name":"Ada","count":2}']) }]);
    const model = createCodexGuideModel({
      host,
      id: 'codex/default',
      workDirectory: directory,
    });

    await expect(model.generateObject(request)).resolves.toEqual({
      value: { name: 'Ada', count: 2 },
    });

    const args = calls[0]?.args ?? [];
    const schemaIndex = args.indexOf('--output-schema');
    expect(schemaIndex).toBeGreaterThan(-1);
    const schemaPath = String(args[schemaIndex + 1]);
    expect(schemaPath.startsWith(directory)).toBe(true);
    const schema = JSON.parse(await readFile(schemaPath, 'utf8')) as {
      properties?: Record<string, unknown>;
    };
    expect(schema.properties).toHaveProperty('count');
  });

  it('falls back to the text repair loop when the message is not JSON', async () => {
    const { host, calls } = fakeHost([
      { stdout: jsonl(['this is not json']) },
      { stdout: jsonl(['{"name":"Ada","count":3}']) },
    ]);
    const model = createCodexGuideModel({ host, id: 'codex/default' });

    await expect(model.generateObject(request)).resolves.toEqual({
      value: { name: 'Ada', count: 3 },
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.args).not.toContain('--output-schema');
  });

  it('passes a configured model slug through', async () => {
    const { host, calls } = fakeHost([{ stdout: jsonl(['ok']) }]);
    const model = createCodexGuideModel({
      host,
      id: 'gpt-5.2-codex',
      model: 'gpt-5.2-codex',
    });

    await model.generateText({ system: 'S', prompt: 'P' });

    const args = calls[0]?.args ?? [];
    const modelIndex = args.indexOf('--model');
    expect(args[modelIndex + 1]).toBe('gpt-5.2-codex');
  });

  it('surfaces a non-zero exit with stderr', async () => {
    const { host } = fakeHost([{ code: 1, stderr: 'not logged in', stdout: '' }]);
    const model = createCodexGuideModel({ host, id: 'codex/default' });

    await expect(model.generateText({ system: 'S', prompt: 'P' })).rejects.toThrow(
      /exited with code 1: not logged in/,
    );
  });

  it('names a missing agent message', async () => {
    const { host } = fakeHost([{ stdout: '{"type":"turn.started"}' }]);
    const model = createCodexGuideModel({ host, id: 'codex/default' });

    await expect(model.generateText({ system: 'S', prompt: 'P' })).rejects.toThrow(
      'codex did not emit an agent message',
    );
  });

  it('honours an aborted signal before spawning the CLI', async () => {
    const { host, calls } = fakeHost([{ stdout: jsonl(['never']) }]);
    const model = createCodexGuideModel({ host, id: 'codex/default' });
    const controller = new AbortController();
    controller.abort();

    await expect(
      model.generateText({ system: 'S', prompt: 'P', signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(0);
  });
});
