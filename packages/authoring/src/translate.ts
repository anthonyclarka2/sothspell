import path from 'node:path';
import { z } from 'zod';
import {
  applyTranslation,
  hashText,
  parseSothspell,
  sourceLocaleOf,
  translationIssues,
  withTranslation,
  type SothspellDocument,
  type TourTranslation,
  type TranslationBeat,
  type TranslationChapter,
  type TranslationDiagram,
} from '@sothspell/core';
import { AuthoringCache } from './cache.js';
import { addUsage, type GuideModel, type ModelUsage } from './model.js';
import { loadPrompt, renderPrompt } from './prompts.js';
import {
  protectText,
  protectValue,
  restoreValue,
  type ProtectedSpan,
} from './protect.js';

/**
 * The translation pipeline. The tour is the translation unit: one source tour
 * plus one translation per locale. A model translates one bounded unit at a
 * time (the tour's title, a chapter's title and summary, a diagram's labels, or
 * one beat), with identifiers and code replaced by placeholders first and
 * restored after. Nothing about anchors, paths, or ids is ever sent to the
 * model, and strict validation refuses any answer that drops evidence.
 */

export const TRANSLATION_PROMPT_VERSION = '1.0.0';

export interface TranslationProgress {
  stage: 'tour' | 'chapter' | 'diagram' | 'beat' | 'repair' | 'assembled' | 'done';
  chapterId?: string;
  beatId?: string;
  detail?: string;
}

export interface TranslationQuality {
  locale: string;
  sourceLocale: string;
  units: number;
  modelCalls: number;
  cacheHits: number;
  usage: ModelUsage;
  promptVersion: string;
  modelId: string;
  issues: string[];
}

export interface TranslationResult {
  translation: TourTranslation;
  quality: TranslationQuality;
}

/**
 * The cache seam. Keys already carry the source text, target locale, and model
 * version; the interface exists so tests can count hits without a disk.
 */
export interface TranslationCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface TranslateTourOptions {
  targetLocale: string;
  model: GuideModel;
  glossary?: Record<string, string>;
  cacheDirectory?: string;
  cache?: TranslationCache;
  signal?: AbortSignal;
  maxRepairAttempts?: number;
  onProgress?: (progress: TranslationProgress) => void;
}

export class TranslationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(issues.length > 0 ? `${message}: ${issues.join('; ')}` : message);
    this.name = 'TranslationError';
    this.issues = issues;
  }
}

export const TourTranslationUnitSchema = z.object({
  title: z.string().min(1).max(96),
  subtitle: z.string().min(1).max(160),
});

export const ChapterTranslationUnitSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(96),
  summary: z.string().min(10).max(400),
});

export const DiagramTranslationUnitSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(96),
  nodeLabels: z.record(z.string().min(1), z.string().min(1).max(48)),
  edgeLabels: z.record(z.string().min(1), z.string().min(1).max(32)).optional(),
});

export const BeatTranslationUnitSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(96),
  narration: z.string().min(20).max(1200),
  suggestedQuestions: z.array(z.string().min(4).max(240)).max(3).optional(),
});

export type TourTranslationUnit = z.infer<typeof TourTranslationUnitSchema>;
export type ChapterTranslationUnit = z.infer<typeof ChapterTranslationUnitSchema>;
export type DiagramTranslationUnit = z.infer<typeof DiagramTranslationUnitSchema>;
export type BeatTranslationUnit = z.infer<typeof BeatTranslationUnitSchema>;

/**
 * The tokens a translation must never rewrite: anchor ids, repository paths,
 * and symbol names. Diagram node ids stay out: they are not human-facing.
 */
export function vocabularyFor(document: SothspellDocument): string[] {
  const terms = new Set<string>();
  for (const chapter of document.chapters) {
    for (const beat of chapter.beats) {
      for (const anchor of beat.anchors) {
        terms.add(anchor.id);
        terms.add(anchor.path);
        if (anchor.symbol !== undefined) {
          terms.add(anchor.symbol);
        }
      }
    }
  }
  return [...terms];
}

interface TranslationUnit {
  kind: 'tour' | 'chapter' | 'diagram' | 'beat';
  schemaName: string;
  schema: z.ZodType<unknown>;
  /** The unit with protected tokens replaced by placeholders (what the model sees). */
  source: unknown;
  /** The unit as written, used to check that protected tokens survived. */
  original: unknown;
  spans: ProtectedSpan[];
  vocabulary: string[];
  /** Fields that must echo the source exactly, keyed by field name. */
  requiredIds: Record<string, string>;
  chapterId?: string;
  beatId?: string;
  label: string;
}

function buildUnit(input: {
  kind: TranslationUnit['kind'];
  schemaName: string;
  schema: z.ZodType<unknown>;
  source: unknown;
  vocabulary: string[];
  requiredIds?: Record<string, string>;
  chapterId?: string;
  beatId?: string;
  label: string;
}): TranslationUnit {
  const protectedSource = protectValue(input.source, input.vocabulary);
  return {
    kind: input.kind,
    schemaName: input.schemaName,
    schema: input.schema,
    source: protectedSource.value,
    original: input.source,
    spans: protectedSource.spans,
    vocabulary: input.vocabulary,
    requiredIds: input.requiredIds ?? {},
    ...(input.chapterId === undefined ? {} : { chapterId: input.chapterId }),
    ...(input.beatId === undefined ? {} : { beatId: input.beatId }),
    label: input.label,
  };
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item));
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      collectStrings(item),
    );
  }
  return [];
}

function renderGlossary(glossary: Record<string, string> | undefined): string {
  if (!glossary) {
    return '';
  }
  const entries = Object.entries(glossary);
  if (entries.length === 0) {
    return '';
  }
  return `\nGlossary (use these renderings):\n${entries
    .map(([term, rendering]) => `- ${term} → ${rendering}`)
    .join('\n')}\n`;
}

/**
 * Validates one model answer: schema bounds, restored placeholders, echoed ids,
 * and every protected span still present. Issues are repair input, not a
 * verdict; the caller retries with them before failing.
 */
function validateUnit(
  unit: TranslationUnit,
  raw: unknown,
): { value: unknown; issues: string[] } {
  const issues: string[] = [];
  const parsed = unit.schema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push(`${issue.path.join('.') || 'value'}: ${issue.message}`);
    }
    return { value: null, issues };
  }

  const restored = restoreValue(parsed.data, unit.spans);
  issues.push(...restored.issues);

  for (const [field, expected] of Object.entries(unit.requiredIds)) {
    const actual = (restored.value as Record<string, unknown>)[field];
    if (actual !== expected) {
      issues.push(
        `${field} is ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
      );
    }
  }

  const sourceStrings = collectStrings(unit.original);
  const translatedStrings = collectStrings(restored.value);
  if (sourceStrings.length !== translatedStrings.length) {
    issues.push(
      `the unit has ${sourceStrings.length} strings; the translation has ${translatedStrings.length}`,
    );
  } else {
    for (let index = 0; index < sourceStrings.length; index += 1) {
      const source = sourceStrings[index] ?? '';
      const translated = translatedStrings[index] ?? '';
      for (const span of protectText(source, unit.vocabulary).spans) {
        if (!translated.includes(span.value)) {
          issues.push(
            `the translation dropped ${JSON.stringify(span.value)} from ${JSON.stringify(source)}`,
          );
        }
      }
    }
  }

  return { value: restored.value, issues };
}

interface TranslationRunner {
  model: GuideModel;
  cache: TranslationCache | null;
  options: TranslateTourOptions;
  sourceLocale: string;
  modelCalls: number;
  cacheHits: number;
  unitCount: number;
  usage: ModelUsage;
}

async function callModel(
  runner: TranslationRunner,
  unit: TranslationUnit,
  prompt: string,
): Promise<unknown> {
  const system = loadPrompt('translate-system');
  try {
    const result = await runner.model.generateObject<unknown>({
      schema: unit.schema,
      schemaName: unit.schemaName,
      system,
      prompt,
      ...(runner.options.signal === undefined ? {} : { signal: runner.options.signal }),
    });
    runner.modelCalls += 1;
    runner.usage = addUsage(runner.usage, result.usage);
    return result.value;
  } catch (error) {
    throw new TranslationError(`the model did not return a valid ${unit.schemaName}`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

async function translateUnit(
  runner: TranslationRunner,
  unit: TranslationUnit,
): Promise<unknown> {
  runner.unitCount += 1;
  runner.options.onProgress?.({
    stage: unit.kind,
    ...(unit.chapterId === undefined ? {} : { chapterId: unit.chapterId }),
    ...(unit.beatId === undefined ? {} : { beatId: unit.beatId }),
    detail: unit.label,
  });

  // The key is the source text, the target locale, and the model version; a
  // changed source, locale, or model must miss, and a cached unit never calls
  // the provider again.
  const key = hashText(
    [
      runner.model.id,
      TRANSLATION_PROMPT_VERSION,
      unit.schemaName,
      runner.options.targetLocale,
      JSON.stringify(unit.source),
    ].join('\u0000'),
  );

  if (runner.cache) {
    const cached = await runner.cache.get<unknown>(key);
    if (cached !== null) {
      runner.cacheHits += 1;
      return cached;
    }
  }

  const promptValues = {
    unit: unit.kind,
    sourceLocale: runner.sourceLocale,
    targetLocale: runner.options.targetLocale,
    glossary: renderGlossary(runner.options.glossary),
    source: unit.source,
  };
  let raw = await callModel(
    runner,
    unit,
    renderPrompt(loadPrompt('translate'), promptValues),
  );
  let validated = validateUnit(unit, raw);

  let attempts = 0;
  const maxAttempts = runner.options.maxRepairAttempts ?? 2;
  while (validated.issues.length > 0 && attempts < maxAttempts) {
    attempts += 1;
    runner.options.onProgress?.({
      stage: 'repair',
      ...(unit.chapterId === undefined ? {} : { chapterId: unit.chapterId }),
      ...(unit.beatId === undefined ? {} : { beatId: unit.beatId }),
      detail: validated.issues.join('; '),
    });
    const repairPrompt = renderPrompt(loadPrompt('translate-repair'), {
      unit: unit.kind,
      targetLocale: runner.options.targetLocale,
      sourceLocale: runner.sourceLocale,
      issues: validated.issues,
      source: unit.source,
      draft: raw,
    });
    raw = await callModel(runner, unit, repairPrompt);
    validated = validateUnit(unit, raw);
  }

  if (validated.issues.length > 0) {
    throw new TranslationError(
      `the ${unit.kind} translation did not pass validation`,
      validated.issues,
    );
  }

  if (runner.cache) {
    await runner.cache.set(key, validated.value);
  }
  return validated.value;
}

/**
 * Strict acceptance for a completed translation. It checks the structural
 * bindings (ids, counts, order), proves that the rendered document keeps every
 * anchor and stage reference byte-for-byte, and confirms that every protected
 * token from the source text survived in its translated counterpart.
 */
export function validateTranslation(
  document: SothspellDocument,
  translation: TourTranslation,
): string[] {
  const issues = translationIssues(document, translation);
  if (issues.length > 0) {
    return issues;
  }

  const vocabulary = vocabularyFor(document);
  const rendered = applyTranslation(
    withTranslation(document, translation),
    translation.locale,
  );

  const requireSpans = (source: string, translated: string, label: string): void => {
    for (const span of protectText(source, vocabulary).spans) {
      if (!translated.includes(span.value)) {
        issues.push(`${label} dropped ${JSON.stringify(span.value)}`);
      }
    }
  };

  requireSpans(document.title, translation.title, 'the title');
  requireSpans(document.subtitle, translation.subtitle, 'the subtitle');

  for (let chapterIndex = 0; chapterIndex < document.chapters.length; chapterIndex += 1) {
    const sourceChapter = document.chapters[chapterIndex];
    const translatedChapter = translation.chapters[chapterIndex];
    const renderedChapter = rendered.chapters[chapterIndex];
    if (!sourceChapter || !translatedChapter || !renderedChapter) {
      continue;
    }

    requireSpans(
      sourceChapter.title,
      translatedChapter.title,
      `chapter ${sourceChapter.id} title`,
    );
    requireSpans(
      sourceChapter.summary,
      translatedChapter.summary,
      `chapter ${sourceChapter.id} summary`,
    );

    for (
      let diagramIndex = 0;
      diagramIndex < sourceChapter.diagrams.length;
      diagramIndex += 1
    ) {
      const sourceDiagram = sourceChapter.diagrams[diagramIndex];
      const translatedDiagram = translatedChapter.diagrams[diagramIndex];
      if (!sourceDiagram || !translatedDiagram) {
        continue;
      }
      requireSpans(
        sourceDiagram.title,
        translatedDiagram.title,
        `diagram ${sourceDiagram.id} title`,
      );
      for (const node of sourceDiagram.nodes) {
        const label = translatedDiagram.nodeLabels?.[node.id];
        if (label !== undefined) {
          requireSpans(node.label, label, `diagram ${sourceDiagram.id} node ${node.id}`);
        }
      }
    }

    for (let beatIndex = 0; beatIndex < sourceChapter.beats.length; beatIndex += 1) {
      const sourceBeat = sourceChapter.beats[beatIndex];
      const translatedBeat = translatedChapter.beats[beatIndex];
      const renderedBeat = renderedChapter.beats[beatIndex];
      if (!sourceBeat || !translatedBeat || !renderedBeat) {
        continue;
      }

      requireSpans(sourceBeat.title, translatedBeat.title, `beat ${sourceBeat.id} title`);
      requireSpans(
        sourceBeat.narration,
        translatedBeat.narration,
        `beat ${sourceBeat.id} narration`,
      );
      const sourceQuestions = sourceBeat.suggestedQuestions ?? [];
      const translatedQuestions = translatedBeat.suggestedQuestions ?? [];
      for (
        let questionIndex = 0;
        questionIndex < sourceQuestions.length;
        questionIndex += 1
      ) {
        requireSpans(
          sourceQuestions[questionIndex] ?? '',
          translatedQuestions[questionIndex] ?? '',
          `beat ${sourceBeat.id} question ${questionIndex + 1}`,
        );
      }

      if (JSON.stringify(sourceBeat.anchors) !== JSON.stringify(renderedBeat.anchors)) {
        issues.push(`beat ${sourceBeat.id} changed its anchors`);
      }
      if (JSON.stringify(sourceBeat.stage) !== JSON.stringify(renderedBeat.stage)) {
        issues.push(`beat ${sourceBeat.id} changed its stage`);
      }
    }
  }

  return issues;
}

/**
 * Translates one tour into one locale and returns the translation plus its
 * quality record. Units already in the cache are reused, so a failed run can be
 * resumed without paying for the beats that already passed.
 */
export async function translateTour(input: {
  tour: unknown;
  targetLocale: string;
  model: GuideModel;
  glossary?: Record<string, string>;
  cacheDirectory?: string;
  cache?: TranslationCache;
  signal?: AbortSignal;
  maxRepairAttempts?: number;
  onProgress?: (progress: TranslationProgress) => void;
}): Promise<TranslationResult> {
  const document = parseSothspell(input.tour);
  const sourceLocale = sourceLocaleOf(document);
  if (input.targetLocale === sourceLocale) {
    throw new TranslationError(`the tour is already in ${sourceLocale}`, [
      `a translation needs a locale other than ${sourceLocale}`,
    ]);
  }

  const cache =
    input.cache ??
    (input.cacheDirectory === undefined
      ? null
      : new AuthoringCache(
          path.join(input.cacheDirectory, 'translation'),
          TRANSLATION_PROMPT_VERSION,
        ));

  const runner: TranslationRunner = {
    model: input.model,
    cache,
    options: input,
    sourceLocale,
    modelCalls: 0,
    cacheHits: 0,
    unitCount: 0,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };
  const vocabulary = vocabularyFor(document);

  const tourValue = (await translateUnit(
    runner,
    buildUnit({
      kind: 'tour',
      schemaName: 'TourTranslationUnit',
      schema: TourTranslationUnitSchema,
      source: { title: document.title, subtitle: document.subtitle },
      vocabulary,
      label: document.title,
    }),
  )) as TourTranslationUnit;

  const chapters: TranslationChapter[] = [];
  for (const chapter of document.chapters) {
    const chapterValue = (await translateUnit(
      runner,
      buildUnit({
        kind: 'chapter',
        schemaName: 'ChapterTranslationUnit',
        schema: ChapterTranslationUnitSchema,
        source: { id: chapter.id, title: chapter.title, summary: chapter.summary },
        vocabulary,
        requiredIds: { id: chapter.id },
        chapterId: chapter.id,
        label: chapter.title,
      }),
    )) as ChapterTranslationUnit;

    const diagrams: TranslationDiagram[] = [];
    for (const diagram of chapter.diagrams) {
      const diagramValue = (await translateUnit(
        runner,
        buildUnit({
          kind: 'diagram',
          schemaName: 'DiagramTranslationUnit',
          schema: DiagramTranslationUnitSchema,
          source: {
            id: diagram.id,
            title: diagram.title,
            nodeLabels: Object.fromEntries(
              diagram.nodes.map((node) => [node.id, node.label]),
            ),
            edgeLabels: Object.fromEntries(
              diagram.edges
                .filter((edge) => edge.label !== undefined)
                .map((edge) => [edge.id, edge.label]),
            ),
          },
          vocabulary,
          requiredIds: { id: diagram.id },
          chapterId: chapter.id,
          label: diagram.title,
        }),
      )) as DiagramTranslationUnit;

      diagrams.push({
        id: diagram.id,
        title: diagramValue.title,
        nodeLabels: diagramValue.nodeLabels,
        ...(diagramValue.edgeLabels === undefined ||
        Object.keys(diagramValue.edgeLabels).length === 0
          ? {}
          : { edgeLabels: diagramValue.edgeLabels }),
      });
    }

    const beats: TranslationBeat[] = [];
    for (const beat of chapter.beats) {
      const beatValue = (await translateUnit(
        runner,
        buildUnit({
          kind: 'beat',
          schemaName: 'BeatTranslationUnit',
          schema: BeatTranslationUnitSchema,
          source: {
            id: beat.id,
            title: beat.title,
            narration: beat.narration,
            ...(beat.suggestedQuestions === undefined
              ? {}
              : { suggestedQuestions: beat.suggestedQuestions }),
          },
          vocabulary,
          requiredIds: { id: beat.id },
          chapterId: chapter.id,
          beatId: beat.id,
          label: beat.title,
        }),
      )) as BeatTranslationUnit;

      beats.push({
        id: beat.id,
        title: beatValue.title,
        narration: beatValue.narration,
        ...(beatValue.suggestedQuestions === undefined
          ? {}
          : { suggestedQuestions: beatValue.suggestedQuestions }),
      });
    }

    chapters.push({
      id: chapter.id,
      title: chapterValue.title,
      summary: chapterValue.summary,
      diagrams,
      beats,
    });
  }

  const translation: TourTranslation = {
    locale: input.targetLocale,
    sourceLocale,
    title: tourValue.title,
    subtitle: tourValue.subtitle,
    chapters,
    modelId: input.model.id,
    promptVersion: TRANSLATION_PROMPT_VERSION,
  };

  const issues = validateTranslation(document, translation);
  if (issues.length > 0) {
    throw new TranslationError('the translation did not pass validation', issues);
  }

  input.onProgress?.({ stage: 'assembled' });
  input.onProgress?.({ stage: 'done' });

  return {
    translation,
    quality: {
      locale: input.targetLocale,
      sourceLocale,
      units: runner.unitCount,
      modelCalls: runner.modelCalls,
      cacheHits: runner.cacheHits,
      usage: runner.usage,
      promptVersion: TRANSLATION_PROMPT_VERSION,
      modelId: input.model.id,
      issues: [],
    },
  };
}
