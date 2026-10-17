import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SothspellRpc } from './rpc.js';

function schemaOf(value: unknown): z.ZodType {
  return value as z.ZodType;
}

describe('SothspellRpc contract', () => {
  it('declares the six methods external clients depend on', () => {
    expect(Object.keys(SothspellRpc.methods).toSorted()).toEqual([
      'ask',
      'cancel',
      'generate',
      'open',
      'progress',
      'status',
    ]);
  });

  it('declares generation and run events', () => {
    expect(Object.keys(SothspellRpc.events).toSorted()).toEqual([
      'generation.progress',
      'run.updated',
    ]);
  });

  it('describes status with no tour and an in-progress run', () => {
    const output = schemaOf(SothspellRpc.methods.status.output);

    expect(
      output.parse({
        projectRoot: '/repo',
        tourId: null,
        playerUrl: 'http://127.0.0.1:5173',
        run: null,
      }),
    ).toEqual({
      projectRoot: '/repo',
      tourId: null,
      playerUrl: 'http://127.0.0.1:5173',
      run: null,
    });

    expect(
      output.parse({
        projectRoot: '/repo',
        tourId: 'tour_demo',
        playerUrl: 'http://127.0.0.1:5173',
        run: { beatId: 'beat_three', completed: 2 },
      }),
    ).toMatchObject({ run: { beatId: 'beat_three', completed: 2 } });
  });

  it('bounds generation input and strips no caller fields', () => {
    const input = schemaOf(SothspellRpc.methods.generate.input);

    expect(input.parse({ maxMinutes: 8 })).toEqual({ maxMinutes: 8 });
    expect(input.parse({})).toEqual({});
    expect(input.safeParse({ maxMinutes: 0 }).success).toBe(false);
    expect(input.safeParse({ maxMinutes: 121 }).success).toBe(false);
  });

  it('requires a real question for ask', () => {
    const input = schemaOf(SothspellRpc.methods.ask.input);

    expect(input.parse({ question: 'How does the index update?' })).toEqual({
      question: 'How does the index update?',
    });
    expect(input.safeParse({ question: '' }).success).toBe(false);
    expect(input.safeParse({ question: '  ' }).success).toBe(false);
    expect(input.safeParse({ question: 'ok?', beatId: 4 }).success).toBe(false);
  });

  it('declares expected failures instead of leaking host errors', () => {
    expect(Object.keys(SothspellRpc.methods.generate.errors ?? {})).toEqual([
      'generation_running',
    ]);
    expect(Object.keys(SothspellRpc.methods.ask.errors ?? {})).toEqual(['no_tour']);
  });

  it('validates event payloads as objects', () => {
    const progress = schemaOf(SothspellRpc.events['generation.progress'].schema);
    const run = schemaOf(SothspellRpc.events['run.updated'].schema);

    expect(progress.parse({ stage: 'chapter', chapterIndex: 1 })).toEqual({
      stage: 'chapter',
      chapterIndex: 1,
    });
    expect(progress.safeParse({ stage: 'chapter', chapterIndex: -1 }).success).toBe(
      false,
    );
    expect(run.parse({ tourId: 'tour_demo', beatId: 'beat_one', completed: 1 })).toEqual({
      tourId: 'tour_demo',
      beatId: 'beat_one',
      completed: 1,
    });
    expect(run.safeParse({ tourId: null, completed: 0 }).success).toBe(false);
  });
});
