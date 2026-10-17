import { describe, expect, it } from 'vitest';
import { hashText, parseSothspell, type SothspellDocument } from '@sothspell/core';
import { FakeGuideModel, type FakeModelRequest } from './fake-model.js';
import { createFixtureTranslationModel } from './fixture-translation.js';
import {
  TranslationError,
  translateTour,
  validateTranslation,
  type TranslationCache,
  type TranslationProgress,
} from './translate.js';

const EXCERPT_ONE =
  'export function readSourceRange(path, start, end) {\n  return path;\n}';
const EXCERPT_TWO = 'export const BOOTSTRAP_FLAG = true;';

function fixtureDocument(): unknown {
  return {
    schemaVersion: '1.0.0',
    id: 'tour_translate_fixture',
    title: 'A small fixture',
    subtitle: 'Two beats used to exercise the translation pipeline',
    audience: 'new-contributor',
    project: {
      slug: 'fixture',
      name: 'Fixture',
      revision: { commit: 'abc1234', branch: 'main', dirty: false },
    },
    chapters: [
      {
        id: 'chapter_one',
        title: 'Reading evidence',
        summary: 'One chapter about reading source evidence safely.',
        diagrams: [
          {
            id: 'diagram_one',
            kind: 'architecture',
            title: 'Reader and flag',
            nodes: [
              { id: 'node_reader', label: 'Reader', type: 'function' },
              { id: 'node_flag', label: 'Flag', type: 'store' },
            ],
            edges: [
              {
                id: 'edge_one',
                from: 'node_reader',
                to: 'node_flag',
                kind: 'reads',
                label: 'reads flag',
              },
            ],
          },
        ],
        beats: [
          {
            id: 'beat_one',
            title: 'The reader',
            narration:
              'The reader is readSourceRange, and it lives in src/reader.ts. It reads the requested lines without touching anything else in the project.',
            anchors: [
              {
                id: 'anchor_reader',
                path: 'src/reader.ts',
                symbol: 'readSourceRange',
                lines: { start: 1, end: 3 },
                contentHash: hashText(EXCERPT_ONE),
                excerpt: EXCERPT_ONE,
              },
            ],
            stage: {
              anchorIds: ['anchor_reader'],
              diagramId: 'diagram_one',
              nodeIds: ['node_reader'],
            },
            suggestedQuestions: ['Where does readSourceRange live?'],
          },
          {
            id: 'beat_two',
            title: 'The flag',
            narration:
              'The second beat explains BOOTSTRAP_FLAG and why the reader checks it before reading any lines from the project.',
            anchors: [
              {
                id: 'anchor_flag',
                path: 'src/flags.ts',
                symbol: 'BOOTSTRAP_FLAG',
                lines: { start: 1, end: 1 },
                contentHash: hashText(EXCERPT_TWO),
                excerpt: EXCERPT_TWO,
              },
            ],
            stage: {
              anchorIds: ['anchor_flag'],
              diagramId: 'diagram_one',
              nodeIds: ['node_flag'],
            },
          },
        ],
      },
    ],
  };
}

function memoryCache(): TranslationCache & { size: () => number } {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return (store.get(key) as T | undefined) ?? null;
    },
    async set<T>(key: string, value: T) {
      store.set(key, value);
    },
    size: () => store.size,
  };
}

/** Pulls the first fenced JSON block out of a prompt. */
function sourceFromPrompt(prompt: string): Record<string, unknown> {
  const match = /```json\n([\s\S]*?)\n```/.exec(prompt);
  if (!match?.[1]) {
    throw new Error('the prompt has no JSON block');
  }
  return JSON.parse(match[1]) as Record<string, unknown>;
}

const UNIT_ORDER = [
  'TourTranslationUnit',
  'ChapterTranslationUnit',
  'DiagramTranslationUnit',
  'BeatTranslationUnit',
  'BeatTranslationUnit',
];

/** Prefixes every non-id string; used by recorder models in these tests. */
function prefixStrings(value: unknown, prefix: string): unknown {
  if (typeof value === 'string') {
    return `${prefix} ${value}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => prefixStrings(item, prefix));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        key === 'id' ? item : prefixStrings(item, prefix),
      ]),
    );
  }
  return value;
}

describe('translateTour', () => {
  it('translates every unit with the fixture model and keeps ids and evidence', async () => {
    const model = createFixtureTranslationModel('es');
    const { translation, quality } = await translateTour({
      tour: fixtureDocument(),
      targetLocale: 'es',
      model,
    });

    expect(translation.locale).toBe('es');
    expect(translation.sourceLocale).toBe('en');
    expect(translation.modelId).toBe(model.id);
    expect(translation.chapters).toHaveLength(1);
    expect(translation.chapters[0]?.id).toBe('chapter_one');
    expect(translation.chapters[0]?.beats.map((beat) => beat.id)).toEqual([
      'beat_one',
      'beat_two',
    ]);
    expect(translation.chapters[0]?.diagrams[0]?.id).toBe('diagram_one');
    expect(translation.chapters[0]?.beats[0]?.narration).toContain('readSourceRange');
    expect(translation.chapters[0]?.beats[0]?.narration).toContain('src/reader.ts');
    expect(translation.chapters[0]?.beats[0]?.narration).toContain('«es»');
    expect(translation.chapters[0]?.diagrams[0]?.nodeLabels?.node_reader).toContain(
      '«es»',
    );
    expect(quality.units).toBe(5);
    expect(quality.modelCalls).toBe(5);
    expect(quality.cacheHits).toBe(0);
    expect(quality.issues).toEqual([]);
  });

  it('replaces identifiers and paths with placeholders before prompting the model', async () => {
    const prompts: string[] = [];
    const model = new FakeGuideModel((request: FakeModelRequest) => {
      prompts.push(request.prompt);
      return prefixStrings(sourceFromPrompt(request.prompt), 'ES');
    }, 'recorder');

    const { translation } = await translateTour({
      tour: fixtureDocument(),
      targetLocale: 'es',
      model,
    });

    const beatPrompt = prompts.find((prompt) => prompt.includes('"narration"')) ?? '';
    expect(beatPrompt.length).toBeGreaterThan(0);
    // The raw identifier never reaches the model; a placeholder does.
    const allPrompts = prompts.join('\n');
    expect(allPrompts).not.toContain('readSourceRange');
    expect(allPrompts).not.toContain('src/reader.ts');
    expect(allPrompts).toContain('__SS_P');

    const narration = translation.chapters[0]?.beats[0]?.narration ?? '';
    expect(narration).toContain('readSourceRange');
    expect(narration).toContain('src/reader.ts');
    expect(narration.startsWith('ES ')).toBe(true);
  });

  it('includes the glossary in the prompt', async () => {
    const prompts: string[] = [];
    const model = new FakeGuideModel((request) => {
      prompts.push(request.prompt);
      return sourceFromPrompt(request.prompt);
    }, 'recorder');

    await translateTour({
      tour: fixtureDocument(),
      targetLocale: 'es',
      model,
      glossary: { beat: 'pulso' },
    });

    expect(prompts.join('\n')).toContain('pulso');
  });

  it('rejects an answer that breaks the schema', async () => {
    const model = new FakeGuideModel((request) => {
      const source = sourceFromPrompt(request.prompt);
      return { ...source, narration: '' };
    }, 'bad');

    await expect(
      translateTour({ tour: fixtureDocument(), targetLocale: 'es', model }),
    ).rejects.toThrow(TranslationError);
  });

  it('repairs a bad answer instead of failing', async () => {
    let repairs = 0;
    const model = new FakeGuideModel((request) => {
      const source = sourceFromPrompt(request.prompt);
      if (
        request.schemaName === 'BeatTranslationUnit' &&
        source.narration !== undefined
      ) {
        if (!request.prompt.includes('did not pass validation')) {
          return { ...source, narration: 'ES short' };
        }
        repairs += 1;
      }
      return source;
    }, 'repairer');
    const progress: TranslationProgress[] = [];

    const { translation } = await translateTour({
      tour: fixtureDocument(),
      targetLocale: 'es',
      model,
      onProgress: (event) => progress.push(event),
    });

    expect(repairs).toBeGreaterThan(0);
    expect(progress.some((event) => event.stage === 'repair')).toBe(true);
    expect(translation.chapters[0]?.beats[0]?.narration).toContain('readSourceRange');
  });

  it('serves a cached unit without calling the model again', async () => {
    const cache = memoryCache();
    const first = await translateTour({
      tour: fixtureDocument(),
      targetLocale: 'es',
      model: createFixtureTranslationModel('es'),
      cache,
    });
    const secondModel = createFixtureTranslationModel('es');
    const second = await translateTour({
      tour: fixtureDocument(),
      targetLocale: 'es',
      model: secondModel,
      cache,
    });

    expect(first.quality.modelCalls).toBe(5);
    expect(secondModel.calls).toHaveLength(0);
    expect(second.quality.modelCalls).toBe(0);
    expect(second.quality.cacheHits).toBe(5);
    expect(second.translation).toEqual(first.translation);

    // A different model version must miss every key.
    const thirdModel = createFixtureTranslationModel('es', 'another-model');
    const third = await translateTour({
      tour: fixtureDocument(),
      targetLocale: 'es',
      model: thirdModel,
      cache,
    });
    expect(third.quality.cacheHits).toBe(0);
    expect(thirdModel.calls).toHaveLength(5);
  });

  it('resumes after a failed beat using the units already cached', async () => {
    const cache = memoryCache();
    let calls = 0;
    const failingModel = new FakeGuideModel((request) => {
      calls += 1;
      if (calls === 5) {
        throw new Error('provider exploded');
      }
      const source = sourceFromPrompt(request.prompt);
      return Object.fromEntries(
        Object.entries(source).map(([key, value]) => [
          key,
          typeof value === 'string' && key !== 'id' ? `ES ${value}` : value,
        ]),
      );
    }, 'failing');

    await expect(
      translateTour({
        tour: fixtureDocument(),
        targetLocale: 'es',
        model: failingModel,
        cache,
      }),
    ).rejects.toThrow(TranslationError);

    const resumingModel = createFixtureTranslationModel('es', 'failing');
    const resumed = await translateTour({
      tour: fixtureDocument(),
      targetLocale: 'es',
      model: resumingModel,
      cache,
    });

    expect(resumed.quality.cacheHits).toBe(4);
    expect(resumingModel.calls).toHaveLength(1);
    expect(resumed.quality.modelCalls).toBe(1);
    expect(resumed.translation.chapters[0]?.beats).toHaveLength(2);
  });

  it('refuses to translate a tour into its own source locale', async () => {
    await expect(
      translateTour({
        tour: fixtureDocument(),
        targetLocale: 'en',
        model: createFixtureTranslationModel('es'),
      }),
    ).rejects.toThrow(/already in en/);
  });

  it('rejects a translation that drops a protected identifier', async () => {
    const model = createFixtureTranslationModel('es');
    const { translation } = await translateTour({
      tour: fixtureDocument(),
      targetLocale: 'es',
      model,
    });

    const mutated = structuredClone(translation);
    mutated.chapters[0]!.beats[0]!.narration = 'Una explicación sin el identificador.';

    const document = parseSothspell(fixtureDocument()) as SothspellDocument;
    expect(validateTranslation(document, mutated).join(' ')).toMatch(/readSourceRange/);
  });

  it('accepts the fixture translation', async () => {
    const model = createFixtureTranslationModel('ar');
    const { translation } = await translateTour({
      tour: fixtureDocument(),
      targetLocale: 'ar',
      model,
    });
    const document = parseSothspell(fixtureDocument());

    expect(validateTranslation(document, translation)).toEqual([]);
  });

  it('orders units tour, chapter, diagram, then beats', async () => {
    const order: string[] = [];
    const model = new FakeGuideModel((request) => {
      order.push(request.schemaName);
      return sourceFromPrompt(request.prompt);
    }, 'ordered');

    await translateTour({ tour: fixtureDocument(), targetLocale: 'es', model });

    expect(order).toEqual(UNIT_ORDER);
  });
});
