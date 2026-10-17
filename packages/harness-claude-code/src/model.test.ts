import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ClaudeCodeHost, ClaudeCodeHostRunInput } from './host.js';
import { createClaudeCodeGuideModel, parseClaudeCodeResult } from './model.js';

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

interface FakeResponse {
  code?: number;
  json?: unknown;
  stdout?: string;
  stderr?: string;
}

function fakeHost(responses: FakeResponse[]) {
  const calls: ClaudeCodeHostRunInput[] = [];
  let index = 0;
  const host: ClaudeCodeHost = {
    async run(input) {
      calls.push(input);
      const response = responses[Math.min(index, responses.length - 1)] ?? {};
      index += 1;
      return {
        code: response.code ?? 0,
        stdout: response.stdout ?? JSON.stringify(response.json ?? { result: '{}' }),
        stderr: response.stderr ?? '',
      };
    },
  };
  return { host, calls };
}

describe('ClaudeCodeGuideModel', () => {
  it('runs the CLI in print mode with the system prompt appended', async () => {
    const { host, calls } = fakeHost([{ json: { result: 'hello' } }]);
    const model = createClaudeCodeGuideModel({ host, id: 'claude-code/default' });

    await expect(model.generateText({ system: 'S', prompt: 'P' })).resolves.toEqual({
      text: 'hello',
    });

    const args = calls[0]?.args ?? [];
    expect(args.slice(0, 4)).toEqual([
      '-p',
      '--output-format',
      'json',
      '--append-system-prompt',
    ]);
    expect(args[4]).toBe('S');
    expect(args.at(-1)).toBe('P');
    expect(args).not.toContain('--model');
  });

  it('requests schema-validated output with --json-schema', async () => {
    const { host, calls } = fakeHost([
      { json: { structured_output: { name: 'Ada', count: 2 } } },
    ]);
    const model = createClaudeCodeGuideModel({ host, id: 'claude-code/default' });

    await expect(model.generateObject(request)).resolves.toEqual({
      value: { name: 'Ada', count: 2 },
    });

    const args = calls[0]?.args ?? [];
    const schemaIndex = args.indexOf('--json-schema');
    expect(schemaIndex).toBeGreaterThan(-1);
    const schema = JSON.parse(String(args[schemaIndex + 1])) as {
      properties?: Record<string, unknown>;
    };
    expect(schema.properties).toHaveProperty('count');
  });

  it('accepts JSON text when the host omits structured_output', async () => {
    const { host, calls } = fakeHost([{ json: { result: '{"name":"Ada","count":3}' } }]);
    const model = createClaudeCodeGuideModel({ host, id: 'claude-code/default' });

    await expect(model.generateObject(request)).resolves.toEqual({
      value: { name: 'Ada', count: 3 },
    });
    expect(calls).toHaveLength(1);
  });

  it('falls back to the text repair loop when the host returns text', async () => {
    const { host, calls } = fakeHost([
      { json: { result: 'this is not json' } },
      { json: { result: '{"name":"Ada","count":4}' } },
    ]);
    const model = createClaudeCodeGuideModel({ host, id: 'claude-code/default' });

    await expect(model.generateObject(request)).resolves.toEqual({
      value: { name: 'Ada', count: 4 },
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.args).not.toContain('--json-schema');
    expect(calls[1]?.args.at(-1)).toBe('Write a person.');
  });

  it('passes a configured model alias through', async () => {
    const { host, calls } = fakeHost([{ json: { result: 'ok' } }]);
    const model = createClaudeCodeGuideModel({
      host,
      id: 'opus',
      model: 'opus',
    });

    await model.generateText({ system: 'S', prompt: 'P' });

    const args = calls[0]?.args ?? [];
    const modelIndex = args.indexOf('--model');
    expect(args[modelIndex + 1]).toBe('opus');
  });

  it('surfaces a non-zero exit with stderr', async () => {
    const { host } = fakeHost([{ code: 1, stderr: 'not logged in', stdout: '' }]);
    const model = createClaudeCodeGuideModel({ host, id: 'claude-code/default' });

    await expect(model.generateText({ system: 'S', prompt: 'P' })).rejects.toThrow(
      /exited with code 1: not logged in/,
    );
  });

  it('names a non-JSON response', () => {
    expect(() => parseClaudeCodeResult('not json')).toThrow('claude did not return JSON');
  });

  it('honours an aborted signal before spawning the CLI', async () => {
    const { host, calls } = fakeHost([{ json: { result: 'never' } }]);
    const model = createClaudeCodeGuideModel({ host, id: 'claude-code/default' });
    const controller = new AbortController();
    controller.abort();

    await expect(
      model.generateText({ system: 'S', prompt: 'P', signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(0);
  });
});
