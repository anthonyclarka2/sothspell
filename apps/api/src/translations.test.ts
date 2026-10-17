import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashText } from '@sothspell/core';
import { FakeGuideModel, createFixtureTranslationModel } from '@sothspell/authoring';
import { createApp } from './app.js';
import {
  createMemoryTranslationStore,
  createTranslationService,
  type TranslationService,
  type TranslationStore,
} from './translations.js';

// The harness serves its fixture under the app's configured tour id, so the
// same resolver the real app uses finds it; unknown-tour cases use another id.
const TOUR_ID = 'tour_bunbun_golden';
const EXCERPT = 'export function readSourceRange(path) {\n  return path;\n}';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function fixtureTour(): unknown {
  return {
    schemaVersion: '1.0.0',
    id: TOUR_ID,
    title: 'A small fixture',
    subtitle: 'One beat used to exercise the translation routes',
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
            title: 'Reader',
            nodes: [{ id: 'node_reader', label: 'Reader', type: 'function' }],
            edges: [],
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
                contentHash: hashText(EXCERPT),
                excerpt: EXCERPT,
              },
            ],
            stage: {
              anchorIds: ['anchor_reader'],
              diagramId: 'diagram_one',
              nodeIds: ['node_reader'],
            },
            suggestedQuestions: ['Where does readSourceRange live?'],
          },
        ],
      },
    ],
  };
}

async function makeTourPath(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-translation-'));
  roots.push(root);
  const tourPath = path.join(root, 'tour.json');
  await writeFile(tourPath, JSON.stringify(fixtureTour(), null, 2), 'utf8');
  return tourPath;
}

interface Harness {
  request: (path: string, init?: RequestInit) => Promise<Response>;
  store: TranslationStore;
}

async function makeHarness(
  model: FakeGuideModel | null = createFixtureTranslationModel('es'),
): Promise<Harness> {
  const tourPath = await makeTourPath();
  const store = createMemoryTranslationStore();
  const service = createTranslationService({
    resolveTourPath: async (tourId) => (tourId === TOUR_ID ? tourPath : null),
    resolveModel: async () => model,
  });
  const app = createApp({
    databasePath: ':memory:',
    tourJsonPath: tourPath,
    translationStore: store,
    translationService: service,
  });
  return {
    request: (requestPath, init) => Promise.resolve(app.request(requestPath, init)),
    store,
  };
}

function postTranslation(locale: string, init?: RequestInit): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ locale }),
    ...init,
  };
}

describe('translation routes', () => {
  it('translates a tour, stores it, and serves it from the store', async () => {
    const harness = await makeHarness();

    const post = await harness.request(
      `/api/tours/${TOUR_ID}/translations`,
      postTranslation('es'),
    );
    expect(post.status).toBe(201);
    const posted = (await post.json()) as {
      translation: { locale: string; sourceLocale: string; chapters: unknown[] };
      quality: { modelCalls: number };
    };
    expect(posted.translation.locale).toBe('es');
    expect(posted.translation.sourceLocale).toBe('en');
    expect(posted.translation.chapters).toHaveLength(1);
    expect(posted.quality.modelCalls).toBeGreaterThan(0);

    const get = await harness.request(`/api/tours/${TOUR_ID}/translations/es`);
    expect(get.status).toBe(200);
    const stored = (await get.json()) as {
      translation: { chapters: Array<{ beats: Array<{ narration: string }> }> };
    };
    expect(stored.translation.chapters[0]?.beats[0]?.narration).toContain(
      'readSourceRange',
    );
  });

  it('compiles the requested locale from the stored translation', async () => {
    const harness = await makeHarness();
    await harness.request(`/api/tours/${TOUR_ID}/translations`, postTranslation('es'));

    const response = await harness.request(`/api/tours/${TOUR_ID}?locale=es`);
    expect(response.status).toBe(200);
    const tour = (await response.json()) as {
      locale: string;
      sourceLocale: string;
      availableLocales: string[];
      title: string;
      chapters: Array<{
        beats: Array<{
          narration: string;
          anchors: Array<{ id: string; path: string; contentHash: string }>;
        }>;
      }>;
    };

    const beat = tour.chapters[0]?.beats[0];
    expect(tour.locale).toBe('es');
    expect(tour.sourceLocale).toBe('en');
    expect(tour.availableLocales).toEqual(['en', 'es']);
    expect(tour.title).toContain('«es»');
    expect(beat?.narration).toContain('readSourceRange');
    expect(beat?.narration).toContain('src/reader.ts');
    expect(beat?.anchors[0]?.id).toBe('anchor_reader');
    expect(beat?.anchors[0]?.path).toBe('src/reader.ts');
    expect(beat?.anchors[0]?.contentHash).toBe(hashText(EXCERPT));
  });

  it('falls back to the source locale when no translation is stored', async () => {
    const harness = await makeHarness();

    const response = await harness.request(`/api/tours/${TOUR_ID}?locale=es`);

    expect(response.status).toBe(200);
    const tour = (await response.json()) as { locale: string; title: string };
    expect(tour.locale).toBe('en');
    expect(tour.title).toBe('A small fixture');
  });

  it('rejects an invalid locale', async () => {
    const harness = await makeHarness();

    const post = await harness.request(
      `/api/tours/${TOUR_ID}/translations`,
      postTranslation('not a locale'),
    );
    expect(post.status).toBe(400);

    const get = await harness.request(`/api/tours/${TOUR_ID}/translations/nope!`);
    expect(get.status).toBe(400);
  });

  it('rejects an unknown tour', async () => {
    const harness = await makeHarness();

    const post = await harness.request(
      '/api/tours/tour_missing/translations',
      postTranslation('es'),
    );
    expect(post.status).toBe(404);

    const get = await harness.request('/api/tours/tour_missing/translations/es');
    expect(get.status).toBe(404);
  });

  it('rejects a missing translation on GET', async () => {
    const harness = await makeHarness();

    const response = await harness.request(`/api/tours/${TOUR_ID}/translations/ar`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('ar'),
    });
  });

  it('answers 503 when no authoring model is configured', async () => {
    const harness = await makeHarness(null);

    const response = await harness.request(
      `/api/tours/${TOUR_ID}/translations`,
      postTranslation('es'),
    );

    expect(response.status).toBe(503);
  });

  it('answers 422 when the model output fails validation', async () => {
    const broken = new FakeGuideModel(() => ({}), 'broken');
    const harness = await makeHarness(broken);

    const response = await harness.request(
      `/api/tours/${TOUR_ID}/translations`,
      postTranslation('es'),
    );

    expect(response.status).toBe(422);
    const body = (await response.json()) as { issues: string[] };
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('rejects translating into the source locale', async () => {
    const harness = await makeHarness();

    const response = await harness.request(
      `/api/tours/${TOUR_ID}/translations`,
      postTranslation('en'),
    );

    expect(response.status).toBe(422);
  });

  it('accepts a glossary and exposes a service seam', async () => {
    const tourPath = await makeTourPath();
    const store = createMemoryTranslationStore();
    const prompts: string[] = [];
    const model = new FakeGuideModel((request) => {
      prompts.push(request.prompt);
      const match = /```json\n([\s\S]*?)\n```/.exec(request.prompt);
      const source = JSON.parse(match?.[1] ?? '{}') as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(source).map(([key, value]) => [
          key,
          typeof value === 'string' && key !== 'id' ? `ES ${value}` : value,
        ]),
      );
    }, 'recorder');
    const service: TranslationService = createTranslationService({
      resolveTourPath: async (tourId) => (tourId === TOUR_ID ? tourPath : null),
      resolveModel: async () => model,
    });
    const app = createApp({
      databasePath: ':memory:',
      tourJsonPath: tourPath,
      translationStore: store,
      translationService: service,
    });

    const response = await app.request(`/api/tours/${TOUR_ID}/translations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'ar', glossary: { beat: 'pulso' } }),
    });

    expect(response.status).toBe(201);
    expect(prompts.join('\n')).toContain('pulso');
  });
});
