import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createTextGuideModel, type TextGuideModelHost } from './guide-model.js';

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

function textHost(responses: string[]) {
  const calls: Array<{ system: string; prompt: string }> = [];
  let index = 0;
  const host: TextGuideModelHost = {
    async generateText(input) {
      calls.push({ system: input.system, prompt: input.prompt });
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      if (response === undefined) {
        throw new Error('no response configured');
      }
      return response;
    },
  };
  return { host, calls };
}

describe('createTextGuideModel', () => {
  it('parses a JSON object from a fenced host response', async () => {
    const { host, calls } = textHost(['```json\n{"name":"Ada","count":2}\n```']);
    const model = createTextGuideModel(host, { id: 'test/model' });

    await expect(model.generateObject(request)).resolves.toEqual({
      value: { name: 'Ada', count: 2 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).toContain('Respond with exactly one JSON object');
    expect(calls[0]?.system).toContain('"count"');
  });

  it('repairs invalid JSON once before accepting a valid object', async () => {
    const { host, calls } = textHost(['this is not json', '{"name":"Ada","count":3}']);
    const model = createTextGuideModel(host, { id: 'test/model' });

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
    const model = createTextGuideModel(host, { id: 'test/model' });

    await model.generateObject(request);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.prompt).toContain('count: Too small');
  });

  it('stops after the bounded repair budget', async () => {
    const { host, calls } = textHost(['nope']);
    const model = createTextGuideModel(host, { id: 'test/model', maxRepairAttempts: 1 });

    await expect(model.generateObject(request)).rejects.toThrow('after 2 attempt(s)');
    expect(calls).toHaveLength(2);
  });

  it('uses host schema validation first when the host supports it', async () => {
    const structured: unknown[] = [];
    const host: TextGuideModelHost = {
      async generateObject(input) {
        structured.push(input.schemaName);
        return { name: 'Ada', count: 5 };
      },
      async generateText() {
        throw new Error('text generation must not be needed');
      },
    };
    const model = createTextGuideModel(host, { id: 'structured/model' });

    await expect(model.generateObject(request)).resolves.toEqual({
      value: { name: 'Ada', count: 5 },
    });
    expect(structured).toEqual(['Person']);
  });

  it('falls back to the text repair loop when host validation fails', async () => {
    const { host, calls } = textHost(['{"name":"Ada","count":6}']);
    const failing: TextGuideModelHost = {
      ...host,
      async generateObject() {
        throw new Error('structured output unavailable');
      },
    };
    const model = createTextGuideModel(failing, { id: 'structured/model' });

    await expect(model.generateObject(request)).resolves.toEqual({
      value: { name: 'Ada', count: 6 },
    });
    expect(calls).toHaveLength(1);
  });

  it('propagates a host failure instead of repairing it', async () => {
    const host: TextGuideModelHost = {
      async generateText() {
        throw new Error('the host has no text generation');
      },
    };
    const model = createTextGuideModel(host, { id: 'test/model' });

    await expect(model.generateText({ system: 's', prompt: 'p' })).rejects.toThrow(
      'the host has no text generation',
    );
    await expect(model.generateObject(request)).rejects.toThrow(
      'the host has no text generation',
    );
  });

  it('honours an aborted signal before calling the model', async () => {
    const { host, calls } = textHost(['{"name":"Ada","count":1}']);
    const model = createTextGuideModel(host, { id: 'test/model' });
    const controller = new AbortController();
    controller.abort();

    await expect(
      model.generateObject({ ...request, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toHaveLength(0);
  });
});
