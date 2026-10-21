import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  SCHEMA_VERSION,
  applyTranslation,
  migrateSothspell,
  parseSothspell,
  sourceLocaleOf,
  translationIssues,
  withTranslation,
  type SothspellDocument,
  type TourTranslation,
} from './schema.js';
import { compileSothspell } from './compiler.js';
import { hashText } from './source.js';

function sourceDocument(overrides: Partial<SothspellDocument> = {}): unknown {
  const excerpt = 'export function readSourceRange() {\n  return 42;\n}';
  return {
    schemaVersion: '1.0.0',
    id: 'tour_translation_test',
    title: 'Translation test',
    subtitle: 'A fixture with one chapter and one beat',
    audience: 'new-contributor',
    project: {
      slug: 'test',
      name: 'Test',
      revision: { commit: 'abc1234', branch: 'main', dirty: false },
    },
    chapters: [
      {
        id: 'chapter_one',
        title: 'The shape',
        summary: 'One chapter used to exercise the translation schema.',
        diagrams: [
          {
            id: 'diagram_one',
            kind: 'architecture',
            title: 'One box',
            nodes: [
              { id: 'node_api', label: 'API', type: 'service' },
              { id: 'node_store', label: 'Store', type: 'store' },
            ],
            edges: [
              { id: 'edge_one', from: 'node_api', to: 'node_store', kind: 'writes' },
            ],
          },
        ],
        beats: [
          {
            id: 'beat_one',
            title: 'The API',
            narration:
              'The API is the boundary between the browser and the records, and readSourceRange is the helper that reads evidence.',
            durationMs: 12000,
            anchors: [
              {
                id: 'anchor_one',
                path: 'src/api.ts',
                symbol: 'readSourceRange',
                lines: { start: 1, end: 3 },
                contentHash: hashText(excerpt),
                label: 'API boundary',
                excerpt,
              },
            ],
            stage: {
              anchorIds: ['anchor_one'],
              diagramId: 'diagram_one',
              nodeIds: ['node_api'],
              edgeIds: ['edge_one'],
            },
            suggestedQuestions: ['What does the API own?'],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function translationFor(
  document: SothspellDocument,
  overrides: Partial<TourTranslation> = {},
): TourTranslation {
  return {
    locale: 'es',
    sourceLocale: sourceLocaleOf(document),
    title: 'Prueba de traducción',
    subtitle: 'Un ejemplo con un capítulo y un beat',
    chapters: document.chapters.map((chapter) => ({
      id: chapter.id,
      title: 'La forma',
      summary: 'Un capítulo que ejercita el esquema de traducción.',
      diagrams: chapter.diagrams.map((diagram) => ({
        id: diagram.id,
        title: 'Una caja',
        nodeLabels: Object.fromEntries(
          diagram.nodes.map((node) => [node.id, `Nodo ${node.id}`]),
        ),
      })),
      beats: chapter.beats.map((beat) => ({
        id: beat.id,
        title: 'La API',
        narration:
          'La API es la frontera entre el navegador y los registros, y readSourceRange es la ayuda que lee la evidencia.',
        suggestedQuestions: ['¿Qué posee la API?'],
      })),
    })),
    ...overrides,
  };
}

describe('schema migration', () => {
  it('bumps a 1.0.0 tour to the current version and records the source locale', () => {
    const migrated = migrateSothspell(sourceDocument()) as SothspellDocument;

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.locale).toBe(DEFAULT_LOCALE);
  });

  it('accepts a 1.0.0 tour through parseSothspell', () => {
    const document = parseSothspell(sourceDocument());

    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
    expect(sourceLocaleOf(document)).toBe('en');
  });

  it('leaves a current-version document untouched', () => {
    const current = {
      ...(sourceDocument() as Record<string, unknown>),
      schemaVersion: SCHEMA_VERSION,
      locale: 'de',
    };

    expect(migrateSothspell(current)).toEqual(current);
  });

  it('rejects an unknown schema version', () => {
    const future = {
      ...(sourceDocument() as Record<string, unknown>),
      schemaVersion: '2.0.0',
    };

    expect(() => parseSothspell(future)).toThrow();
  });
});

describe('translation schema', () => {
  it('accepts a document with one translation per locale', () => {
    const document = parseSothspell(
      withTranslation(
        parseSothspell(sourceDocument()),
        translationFor(parseSothspell(sourceDocument())),
      ),
    );

    expect(document.translations?.es?.locale).toBe('es');
    expect(document.translations?.es?.chapters[0]?.beats[0]?.id).toBe('beat_one');
  });

  it('rejects a translation whose chapter count differs', () => {
    const source = parseSothspell(sourceDocument());
    const translation = translationFor(source);
    translation.chapters = [];

    const issues = translationIssues(source, translation);
    expect(issues.join(' ')).toMatch(/chapter/i);
    expect(() => parseSothspell(withTranslation(source, translation))).toThrow(
      /chapter/i,
    );
  });

  it('rejects a translation whose beat ids differ', () => {
    const source = parseSothspell(sourceDocument());
    const translation = translationFor(source);
    translation.chapters[0]!.beats[0]!.id = 'beat_renamed';

    expect(translationIssues(source, translation).join(' ')).toMatch(/beat_renamed/);
  });

  it('rejects a translation whose diagram ids differ', () => {
    const source = parseSothspell(sourceDocument());
    const translation = translationFor(source);
    translation.chapters[0]!.diagrams[0]!.id = 'diagram_renamed';

    expect(translationIssues(source, translation).join(' ')).toMatch(/diagram_renamed/);
  });

  it('rejects a translation that labels an unknown diagram node', () => {
    const source = parseSothspell(sourceDocument());
    const translation = translationFor(source);
    translation.chapters[0]!.diagrams[0]!.nodeLabels = { node_missing: 'Falta' };

    expect(translationIssues(source, translation).join(' ')).toMatch(/node_missing/);
  });

  it('rejects a translation whose sourceLocale is not the tour locale', () => {
    const source = parseSothspell(sourceDocument());
    const translation = translationFor(source, { sourceLocale: 'fr' });

    expect(translationIssues(source, translation).join(' ')).toMatch(/source/i);
  });

  it('rejects a translation for the source locale itself', () => {
    const source = parseSothspell(sourceDocument());
    const translation = translationFor(source, { locale: 'en' });

    expect(translationIssues(source, translation).join(' ')).toMatch(/source locale/i);
  });

  it('rejects an empty translated narration', () => {
    const source = parseSothspell(sourceDocument());
    const translation = translationFor(source);
    translation.chapters[0]!.beats[0]!.narration = '';

    expect(() => parseSothspell(withTranslation(source, translation))).toThrow();
  });

  it('rejects a translation that drops the suggested questions', () => {
    const source = parseSothspell(sourceDocument());
    const translation = translationFor(source);
    translation.chapters[0]!.beats[0]!.suggestedQuestions = undefined;

    expect(translationIssues(source, translation).join(' ')).toMatch(
      /suggested questions/i,
    );
  });
});

describe('applyTranslation', () => {
  it('renders the translated strings without touching anchors or ids', () => {
    const source = parseSothspell(sourceDocument());
    const translation = translationFor(source);
    const rendered = applyTranslation(withTranslation(source, translation), 'es');

    const sourceBeat = source.chapters[0]!.beats[0]!;
    const renderedBeat = rendered.chapters[0]!.beats[0]!;

    expect(rendered.locale).toBe('es');
    expect(rendered.title).toBe('Prueba de traducción');
    expect(renderedBeat.title).toBe('La API');
    expect(renderedBeat.narration).toContain('readSourceRange');
    expect(renderedBeat.id).toBe(sourceBeat.id);
    expect(renderedBeat.anchors).toEqual(sourceBeat.anchors);
    expect(renderedBeat.anchors[0]?.path).toBe('src/api.ts');
    expect(renderedBeat.anchors[0]?.lines).toEqual({ start: 1, end: 3 });
    expect(renderedBeat.anchors[0]?.contentHash).toBe(sourceBeat.anchors[0]?.contentHash);
    expect(renderedBeat.stage).toEqual(sourceBeat.stage);
    expect(rendered.chapters[0]!.diagrams[0]!.nodes.map((node) => node.label)).toEqual([
      'Nodo node_api',
      'Nodo node_store',
    ]);
    expect(rendered.chapters[0]!.diagrams[0]!.edges[0]!.id).toBe('edge_one');
    expect(rendered.translations).toBeUndefined();
  });

  it('preserves symbol IDs on anchors and diagram nodes', () => {
    const raw = structuredClone(sourceDocument()) as Record<string, unknown>;
    raw.schemaVersion = '1.2.0';
    const chapters = raw.chapters as Array<Record<string, unknown>>;
    const beat = (chapters[0]!.beats as Array<Record<string, unknown>>)[0]!;
    const anchor = (beat.anchors as Array<Record<string, unknown>>)[0]!;
    anchor.symbolId = 'symbol:src/api.ts#readSourceRange';
    const diagram = (chapters[0]!.diagrams as Array<Record<string, unknown>>)[0]!;
    const node = (diagram.nodes as Array<Record<string, unknown>>)[0]!;
    node.symbolId = 'symbol:src/api.ts#readSourceRange';

    const source = parseSothspell(raw);
    const rendered = applyTranslation(
      withTranslation(source, translationFor(source)),
      'es',
    );

    expect(rendered.chapters[0]!.beats[0]!.anchors[0]!.symbolId).toBe(
      'symbol:src/api.ts#readSourceRange',
    );
    expect(rendered.chapters[0]!.diagrams[0]!.nodes[0]!.symbolId).toBe(
      'symbol:src/api.ts#readSourceRange',
    );
  });

  it('falls back to the source strings when the translation omits diagram labels', () => {
    const source = parseSothspell(sourceDocument());
    const translation = translationFor(source);
    translation.chapters[0]!.diagrams[0]!.nodeLabels = undefined;

    const rendered = applyTranslation(withTranslation(source, translation), 'es');

    expect(rendered.chapters[0]!.diagrams[0]!.nodes[0]!.label).toBe('API');
  });

  it('refuses a locale that has no translation', () => {
    const source = parseSothspell(sourceDocument());

    expect(() => applyTranslation(source, 'es')).toThrow(/es/);
  });

  it('returns the source document for the source locale', () => {
    const source = parseSothspell(sourceDocument());

    expect(applyTranslation(source, 'en')).toBe(source);
  });
});

describe('compileSothspell with a locale', () => {
  it('compiles the requested translation and reports the locale', async () => {
    const source = parseSothspell(sourceDocument());
    const document = withTranslation(source, translationFor(source));

    const compiled = await compileSothspell(document, { locale: 'es' });

    const beat = compiled.chapters[0]!.beats[0]!;
    expect(compiled.locale).toBe('es');
    expect(compiled.sourceLocale).toBe('en');
    expect(compiled.availableLocales).toEqual(['en', 'es']);
    expect(compiled.title).toBe('Prueba de traducción');
    expect(beat.narration).toContain('readSourceRange');
    expect(beat.anchors[0]?.contentHash).toBe(
      source.chapters[0]!.beats[0]!.anchors[0]!.contentHash,
    );
    expect(beat.anchors[0]?.excerpt).toContain('readSourceRange');
  });

  it('falls back to the source locale when the requested locale has no translation', async () => {
    const compiled = await compileSothspell(sourceDocument(), { locale: 'es' });

    expect(compiled.locale).toBe('en');
    expect(compiled.availableLocales).toEqual(['en']);
    expect(compiled.title).toBe('Translation test');
  });
});
