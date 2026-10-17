import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { OpenCodeGuideModel, type GuideModelHost } from './opencode-model.js';

const PersonSchema = z.object({
  name: z.string().min(1),
  count: z.number().int().min(0),
});

function textHost(responses: string[]) {
  const calls: Array<{ prompt: string; model?: unknown }> = [];
  let index = 0;
  const host: GuideModelHost = {
    generate: {
      async text(input) {
        calls.push(input);
        const response = responses[Math.min(index, responses.length - 1)];
        index += 1;
        if (response === undefined) {
          throw new Error('no response configured');
        }
        return { text: response };
      },
    },
  };
  return { host, calls };
}

const request = {
  schema: PersonSchema,
  schemaName: 'Person',
  system: 'You are a guide.',
  prompt: 'Write a person.',
};

describe('OpenCodeGuideModel', () => {
  it('parses a JSON object from a fenced host response', async () => {
    const { host, calls } = textHost(['```json\n{"name":"Ada","count":2}\n```']);
    const model = new OpenCodeGuideModel(host, { id: 'test/model' });

    await expect(model.generateObject(request)).resolves.toEqual({
      value: { name: 'Ada', count: 2 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.prompt).toContain('Respond with exactly one JSON object');
    expect(calls[0]?.prompt).toContain('"count"');
  });

  it('repairs invalid JSON once before accepting a valid object', async () => {
    const { host, calls } = textHost(['this is not json', '{"name":"Ada","count":3}']);
    const model = new OpenCodeGuideModel(host, { id: 'test/model' });

    await expect(model.generateObject(request)).resolves.toEqual({
      value: { name: 'Ada', count: 3 },
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.prompt).toContain('previous response could not be used');
    expect(calls[1]?.prompt).toContain('did not contain a JSON object');
  });

  it('repairs a schema mismatch with the validation issues', async () => {
    const { host, calls } = textHost([
      '{"name":"Ada","count":-1}',
      '{"name":"Ada","count":1}',
    ]);
    const model = new OpenCodeGuideModel(host, { id: 'test/model' });

    await model.generateObject(request);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.prompt).toContain('count: Too small');
  });

  it('stops after the bounded repair budget', async () => {
    const { host, calls } = textHost(['nope']);
    const model = new OpenCodeGuideModel(host, {
      id: 'test/model',
      maxRepairAttempts: 1,
    });

    await expect(model.generateObject(request)).rejects.toThrow('after 2 attempt(s)');
    expect(calls).toHaveLength(2);
  });

  it('passes the selected model to the host', async () => {
    const { host, calls } = textHost(['{"name":"Ada","count":1}']);
    const model = new OpenCodeGuideModel(host, {
      id: 'anthropic/claude-sonnet',
      model: { providerID: 'anthropic', id: 'claude-sonnet' },
    });

    await model.generateObject(request);

    expect(calls[0]?.model).toEqual({
      providerID: 'anthropic',
      id: 'claude-sonnet',
    });
  });

  it('falls back to session generation and reuses the session', async () => {
    const generated: Array<{ sessionID: string; prompt: string }> = [];
    const create = vi.fn(async () => ({ id: 'ses_guide' }));
    const host: GuideModelHost = {
      session: {
        create,
        async generate(input) {
          generated.push(input);
          return { text: '{"name":"Ada","count":4}' };
        },
      },
    };
    const model = new OpenCodeGuideModel(host, { id: 'test/model' });

    await model.generateObject(request);
    await model.generateText({ system: 'You are a guide.', prompt: 'Hello' });

    expect(create).toHaveBeenCalledTimes(1);
    expect(generated).toHaveLength(2);
    expect(generated[0]?.sessionID).toBe('ses_guide');
    expect(generated[0]?.prompt).toContain('Write a person.');
  });

  it('fails clearly when the host has no text generation', async () => {
    const model = new OpenCodeGuideModel({}, { id: 'test/model' });

    await expect(model.generateText({ system: 's', prompt: 'p' })).rejects.toThrow(
      'does not expose text generation',
    );
  });

  it('honours an aborted signal before calling the model', async () => {
    const { host, calls } = textHost(['{"name":"Ada","count":1}']);
    const model = new OpenCodeGuideModel(host, { id: 'test/model' });
    const controller = new AbortController();
    controller.abort();

    await expect(
      model.generateObject({ ...request, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(0);
  });
});
