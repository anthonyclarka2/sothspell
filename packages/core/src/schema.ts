import { z } from 'zod';
import { DiagramInstructionSchema } from '@sothspell/diagram';

/**
 * Schema versions. `1.1.0` added a tour locale and per-locale translations;
 * `1.2.0` adds an optional symbol target to code anchors and diagram nodes.
 * `parseSothspell` runs the migration chain so the checked-in golden tour and
 * older artifacts keep parsing without a rewrite.
 */
export const SCHEMA_VERSION = '1.2.0' as const;
/** The locale and translation step of the migration chain. */
export const LOCALE_SCHEMA_VERSION = '1.1.0' as const;
/** The original shipping format, before locale or symbol targets. */
export const BASE_SCHEMA_VERSION = '1.0.0' as const;
/** The version immediately before the current one. */
export const PREVIOUS_SCHEMA_VERSION = LOCALE_SCHEMA_VERSION;
export const DEFAULT_LOCALE = 'en' as const;

/**
 * Every version stays parseable during the transition; `parseSothspell` migrates
 * an older tour forward, so every document that leaves the parser is current.
 */
export const SUPPORTED_SCHEMA_VERSIONS = [
  BASE_SCHEMA_VERSION,
  LOCALE_SCHEMA_VERSION,
  SCHEMA_VERSION,
] as const;

/**
 * A BCP-47-style locale tag. Sóþspell only needs the language and an optional
 * region/script suffix (`es`, `ar`, `pt-BR`), so the pattern stays deliberately
 * narrow instead of accepting arbitrary strings.
 */
export const LocaleSchema = z
  .string()
  .regex(/^[a-z]{2,8}(-[a-z0-9]{2,8})*$/i, 'expected a locale like en, es, ar, or pt-BR');

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/, 'expected a sha256 hash');

const RevisionSchema = z.object({
  commit: z.string().min(4).max(64),
  branch: z.string().min(1).max(128).nullable(),
  dirty: z.boolean(),
});

const ProjectRefSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  name: z.string().min(1).max(96),
  revision: RevisionSchema,
});

const LineRangeSchema = z
  .object({
    start: z.number().int().min(1),
    end: z.number().int().min(1),
  })
  .refine((range) => range.end >= range.start, {
    message: 'line range end must be at or after its start',
  });

export const CodeAnchorSchema = z.object({
  id: z.string().min(1),
  path: z
    .string()
    .min(1)
    .refine((value) => !value.startsWith('/') && !value.includes('..'), {
      message: 'anchor path must be repository-relative',
    }),
  symbol: z.string().min(1).optional(),
  /** The analyzer symbol ID this anchor targets, when one is known. */
  symbolId: z.string().min(1).optional(),
  lines: LineRangeSchema,
  contentHash: Sha256Schema,
  label: z.string().min(1).max(96).optional(),
  language: z.string().min(1).max(32).optional(),
  excerpt: z.string().min(1).optional(),
});

export const StageSchema = z
  .object({
    anchorIds: z.array(z.string().min(1)).max(3),
    diagramId: z.string().min(1).optional(),
    nodeIds: z.array(z.string().min(1)).max(16).optional(),
    edgeIds: z.array(z.string().min(1)).max(24).optional(),
  })
  .refine(
    (stage) =>
      stage.anchorIds.length > 0 ||
      (stage.nodeIds?.length ?? 0) > 0 ||
      (stage.edgeIds?.length ?? 0) > 0,
    { message: 'a beat stage must focus code, a diagram node, or an edge' },
  );

export const BeatSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(96),
  narration: z.string().min(20).max(1200),
  durationMs: z.number().int().min(4000).max(300000).optional(),
  anchors: z.array(CodeAnchorSchema).min(1),
  stage: StageSchema,
  suggestedQuestions: z.array(z.string().min(4).max(240)).max(3).optional(),
});

export const ChapterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(96),
  summary: z.string().min(10).max(400),
  diagrams: z.array(DiagramInstructionSchema).min(1),
  beats: z.array(BeatSchema).min(1),
});

/**
 * A translation carries only human-facing strings. It deliberately has no
 * field for anchors, paths, line ranges, or ids beyond the identifiers needed
 * to bind each string to its source, so a translated tour cannot rename or
 * move evidence.
 */
export const TranslationBeatSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(96),
  narration: z.string().min(20).max(1200),
  suggestedQuestions: z.array(z.string().min(4).max(240)).max(3).optional(),
});

export const TranslationDiagramSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(96),
  nodeLabels: z.record(z.string().min(1), z.string().min(1).max(48)).optional(),
  edgeLabels: z.record(z.string().min(1), z.string().min(1).max(32)).optional(),
});

export const TranslationChapterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(96),
  summary: z.string().min(10).max(400),
  diagrams: z.array(TranslationDiagramSchema),
  beats: z.array(TranslationBeatSchema),
});

export const TourTranslationSchema = z.object({
  locale: LocaleSchema,
  sourceLocale: LocaleSchema,
  title: z.string().min(1).max(96),
  subtitle: z.string().min(1).max(160),
  chapters: z.array(TranslationChapterSchema).min(1),
  modelId: z.string().min(1).max(128).optional(),
  promptVersion: z.string().min(1).max(32).optional(),
});

export const SothspellDocumentSchema = z
  .object({
    schemaVersion: z.enum(SUPPORTED_SCHEMA_VERSIONS),
    id: z.string().min(1),
    title: z.string().min(1).max(96),
    subtitle: z.string().min(1).max(160),
    audience: z.enum(['new-contributor', 'technical-evaluator', 'maintainer']),
    project: ProjectRefSchema,
    locale: LocaleSchema.optional(),
    estimatedDurationMs: z.number().int().min(60000).max(3600000).optional(),
    chapters: z.array(ChapterSchema).min(1).max(12),
    translations: z.record(LocaleSchema, TourTranslationSchema).optional(),
  })
  .superRefine((document, context) => {
    const seenDocumentIds = new Map<string, string>();

    const claimId = (kind: string, id: string): void => {
      const previous = seenDocumentIds.get(id);
      if (previous) {
        context.addIssue({
          code: 'custom',
          message: `duplicate id ${id} (${kind} and ${previous})`,
        });
        return;
      }
      seenDocumentIds.set(id, kind);
    };

    for (const chapter of document.chapters) {
      claimId('chapter', chapter.id);

      for (const diagram of chapter.diagrams) {
        claimId('diagram', diagram.id);
      }

      const diagramById = new Map(
        chapter.diagrams.map((diagram) => [diagram.id, diagram] as const),
      );

      for (const beat of chapter.beats) {
        claimId('beat', beat.id);

        const anchorIds = new Set<string>();
        for (const anchor of beat.anchors) {
          claimId('anchor', anchor.id);
          anchorIds.add(anchor.id);
        }

        for (const anchorId of beat.stage.anchorIds) {
          if (!anchorIds.has(anchorId)) {
            context.addIssue({
              code: 'custom',
              message: `beat ${beat.id} focuses anchor ${anchorId} but does not declare it`,
            });
          }
        }

        if (beat.stage.diagramId) {
          const diagram = diagramById.get(beat.stage.diagramId);
          if (!diagram) {
            context.addIssue({
              code: 'custom',
              message: `beat ${beat.id} references unknown diagram ${beat.stage.diagramId}`,
            });
            continue;
          }

          const nodeIds = new Set(diagram.nodes.map((node) => node.id));
          const edgeIds = new Set(diagram.edges.map((edge) => edge.id));

          for (const nodeId of beat.stage.nodeIds ?? []) {
            if (!nodeIds.has(nodeId)) {
              context.addIssue({
                code: 'custom',
                message: `beat ${beat.id} focuses unknown node ${nodeId} in diagram ${diagram.id}`,
              });
            }
          }

          for (const edgeId of beat.stage.edgeIds ?? []) {
            if (!edgeIds.has(edgeId)) {
              context.addIssue({
                code: 'custom',
                message: `beat ${beat.id} focuses unknown edge ${edgeId} in diagram ${diagram.id}`,
              });
            }
          }
        } else if (
          (beat.stage.nodeIds?.length ?? 0) > 0 ||
          (beat.stage.edgeIds?.length ?? 0) > 0
        ) {
          context.addIssue({
            code: 'custom',
            message: `beat ${beat.id} focuses diagram elements without a diagram`,
          });
        }
      }
    }

    for (const [locale, translation] of Object.entries(document.translations ?? {})) {
      if (translation.locale !== locale) {
        context.addIssue({
          code: 'custom',
          message: `translation key ${locale} does not match its locale ${translation.locale}`,
        });
      }
      for (const issue of translationIssues(document, translation)) {
        context.addIssue({ code: 'custom', message: `translation ${locale}: ${issue}` });
      }
    }
  });

export type Revision = z.infer<typeof RevisionSchema>;
export type ProjectRef = z.infer<typeof ProjectRefSchema>;
export type CodeAnchor = z.infer<typeof CodeAnchorSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type TranslationBeat = z.infer<typeof TranslationBeatSchema>;
export type TranslationDiagram = z.infer<typeof TranslationDiagramSchema>;
export type TranslationChapter = z.infer<typeof TranslationChapterSchema>;
export type TourTranslation = z.infer<typeof TourTranslationSchema>;
export type SothspellDocument = z.infer<typeof SothspellDocumentSchema>;

/** The language a tour was authored in; a missing locale means the default. */
export function sourceLocaleOf(document: SothspellDocument): string {
  return document.locale ?? DEFAULT_LOCALE;
}

/**
 * Structural comparison between a source tour and one translation. The
 * translation must bind every chapter, diagram, and beat by the source's own
 * id and in the source's order; anything else is a renamed or moved element and
 * fails. This is the shared rule behind schema validation and the authoring
 * pipeline's strict acceptance check.
 */
export function translationIssues(
  document: SothspellDocument,
  translation: TourTranslation,
): string[] {
  const issues: string[] = [];
  const sourceLocale = sourceLocaleOf(document);

  if (translation.sourceLocale !== sourceLocale) {
    issues.push(
      `translation declares source locale ${translation.sourceLocale} but the tour is ${sourceLocale}`,
    );
  }
  if (translation.locale === sourceLocale) {
    issues.push(`translation targets the source locale ${sourceLocale}`);
  }

  if (translation.chapters.length !== document.chapters.length) {
    issues.push(
      `translation has ${translation.chapters.length} chapters; the tour has ${document.chapters.length}`,
    );
  }

  const chapterCount = Math.min(translation.chapters.length, document.chapters.length);
  for (let index = 0; index < chapterCount; index += 1) {
    const sourceChapter = document.chapters[index];
    const translatedChapter = translation.chapters[index];
    if (!sourceChapter || !translatedChapter) {
      continue;
    }

    if (translatedChapter.id !== sourceChapter.id) {
      issues.push(
        `chapter ${index + 1} is ${translatedChapter.id}; the tour has ${sourceChapter.id}`,
      );
      continue;
    }

    if (translatedChapter.diagrams.length !== sourceChapter.diagrams.length) {
      issues.push(
        `chapter ${sourceChapter.id} translation has ${translatedChapter.diagrams.length} diagrams; the tour has ${sourceChapter.diagrams.length}`,
      );
    }
    const diagramCount = Math.min(
      translatedChapter.diagrams.length,
      sourceChapter.diagrams.length,
    );
    for (let diagramIndex = 0; diagramIndex < diagramCount; diagramIndex += 1) {
      const sourceDiagram = sourceChapter.diagrams[diagramIndex];
      const translatedDiagram = translatedChapter.diagrams[diagramIndex];
      if (!sourceDiagram || !translatedDiagram) {
        continue;
      }
      if (translatedDiagram.id !== sourceDiagram.id) {
        issues.push(
          `chapter ${sourceChapter.id} diagram ${diagramIndex + 1} is ${translatedDiagram.id}; the tour has ${sourceDiagram.id}`,
        );
        continue;
      }
      const nodeIds = new Set(sourceDiagram.nodes.map((node) => node.id));
      for (const nodeId of Object.keys(translatedDiagram.nodeLabels ?? {})) {
        if (!nodeIds.has(nodeId)) {
          issues.push(
            `diagram ${sourceDiagram.id} translation labels unknown node ${nodeId}`,
          );
        }
      }
      const edgeIds = new Set(sourceDiagram.edges.map((edge) => edge.id));
      for (const edgeId of Object.keys(translatedDiagram.edgeLabels ?? {})) {
        if (!edgeIds.has(edgeId)) {
          issues.push(
            `diagram ${sourceDiagram.id} translation labels unknown edge ${edgeId}`,
          );
        }
      }
    }

    if (translatedChapter.beats.length !== sourceChapter.beats.length) {
      issues.push(
        `chapter ${sourceChapter.id} translation has ${translatedChapter.beats.length} beats; the tour has ${sourceChapter.beats.length}`,
      );
    }
    const beatCount = Math.min(
      translatedChapter.beats.length,
      sourceChapter.beats.length,
    );
    for (let beatIndex = 0; beatIndex < beatCount; beatIndex += 1) {
      const sourceBeat = sourceChapter.beats[beatIndex];
      const translatedBeat = translatedChapter.beats[beatIndex];
      if (!sourceBeat || !translatedBeat) {
        continue;
      }
      if (translatedBeat.id !== sourceBeat.id) {
        issues.push(
          `chapter ${sourceChapter.id} beat ${beatIndex + 1} is ${translatedBeat.id}; the tour has ${sourceBeat.id}`,
        );
        continue;
      }
      const sourceQuestions = sourceBeat.suggestedQuestions ?? [];
      const translatedQuestions = translatedBeat.suggestedQuestions;
      if (
        translatedQuestions !== undefined &&
        translatedQuestions.length !== sourceQuestions.length
      ) {
        issues.push(
          `beat ${sourceBeat.id} translation has ${translatedQuestions.length} suggested questions; the tour has ${sourceQuestions.length}`,
        );
      } else if (translatedQuestions === undefined && sourceQuestions.length > 0) {
        issues.push(
          `beat ${sourceBeat.id} translation is missing its ${sourceQuestions.length} suggested questions`,
        );
      }
    }
  }

  return issues;
}

/**
 * The forward migration chain. Each step owns one version hop and returns a new
 * document; a version with no step is unknown and stays untouched so the schema
 * rejects it instead of silently upgrading something it does not understand.
 */
interface SchemaMigration {
  readonly to: string;
  migrate(document: Record<string, unknown>): Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addLocale(document: Record<string, unknown>): Record<string, unknown> {
  return {
    ...document,
    schemaVersion: LOCALE_SCHEMA_VERSION,
    locale: document.locale ?? DEFAULT_LOCALE,
  };
}

function collectAnchorIds(document: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  const chapters = Array.isArray(document.chapters) ? document.chapters : [];
  for (const chapter of chapters) {
    if (!isRecord(chapter)) {
      continue;
    }
    const beats = Array.isArray(chapter.beats) ? chapter.beats : [];
    for (const beat of beats) {
      if (!isRecord(beat)) {
        continue;
      }
      const anchors = Array.isArray(beat.anchors) ? beat.anchors : [];
      for (const anchor of anchors) {
        if (isRecord(anchor) && typeof anchor.id === 'string') {
          ids.add(anchor.id);
        }
      }
    }
  }
  return ids;
}

/**
 * A generated tour used a candidate symbol ID as `DiagramNode.anchorId`. That
 * value was never a real anchor, so a node that cites it cannot open evidence.
 * Move it to `symbolId` only when it has the symbol shape and no anchor in the
 * document owns the ID; an explicit anchor reference always wins.
 */
function repairNodeSymbolTarget(node: unknown, anchorIds: Set<string>): unknown {
  if (!isRecord(node)) {
    return node;
  }
  const anchorId = node.anchorId;
  if (
    typeof anchorId !== 'string' ||
    !anchorId.startsWith('symbol:') ||
    anchorIds.has(anchorId)
  ) {
    return node;
  }
  const next: Record<string, unknown> = { ...node };
  delete next.anchorId;
  next.symbolId = typeof node.symbolId === 'string' ? node.symbolId : anchorId;
  return next;
}

function addSymbolTargets(document: Record<string, unknown>): Record<string, unknown> {
  const anchorIds = collectAnchorIds(document);
  const chapters = Array.isArray(document.chapters)
    ? document.chapters.map((chapter) => {
        if (!isRecord(chapter)) {
          return chapter;
        }
        const diagrams = Array.isArray(chapter.diagrams)
          ? chapter.diagrams.map((diagram) => {
              if (!isRecord(diagram)) {
                return diagram;
              }
              const nodes = Array.isArray(diagram.nodes)
                ? diagram.nodes.map((node) => repairNodeSymbolTarget(node, anchorIds))
                : diagram.nodes;
              return { ...diagram, nodes };
            })
          : chapter.diagrams;
        return { ...chapter, diagrams };
      })
    : document.chapters;

  return { ...document, schemaVersion: SCHEMA_VERSION, chapters };
}

const SCHEMA_MIGRATIONS: Record<string, SchemaMigration> = {
  [BASE_SCHEMA_VERSION]: { to: LOCALE_SCHEMA_VERSION, migrate: addLocale },
  [LOCALE_SCHEMA_VERSION]: { to: SCHEMA_VERSION, migrate: addSymbolTargets },
};

/**
 * Turns an unknown artifact into a current-version document by walking the
 * migration chain. The input is never mutated; an unknown or cyclic version is
 * returned as-is so validation fails with the original document.
 */
export function migrateSothspell(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  let document = input;
  let version =
    typeof document.schemaVersion === 'string' ? document.schemaVersion : undefined;
  const visited = new Set<string>();

  while (version !== undefined && version !== SCHEMA_VERSION) {
    const step = SCHEMA_MIGRATIONS[version];
    if (!step || visited.has(version)) {
      return input;
    }
    visited.add(version);
    document = step.migrate(document);
    version = step.to;
  }

  return document;
}

/**
 * The single entry point for turning unknown input (an artifact on disk or a
 * model draft) into a document. Every other module may assume the semantic
 * checks have run: IDs are unique, stage references resolve, and every beat
 * carries code evidence.
 */
export function parseSothspell(input: unknown): SothspellDocument {
  return SothspellDocumentSchema.parse(migrateSothspell(input));
}

/**
 * Embeds one translation into its source tour, keeping the source locale
 * recorded on the tour. The CLI and API use this to write a tour that carries
 * both the source and the translation.
 */
export function withTranslation(
  document: SothspellDocument,
  translation: TourTranslation,
): SothspellDocument {
  return {
    ...document,
    schemaVersion: SCHEMA_VERSION,
    locale: sourceLocaleOf(document),
    translations: {
      ...document.translations,
      [translation.locale]: translation,
    },
  };
}

/**
 * Renders the document with one translation applied. The result keeps every id,
 * anchor, path, and line range byte-for-byte from the source; only
 * human-facing strings change. The translation records are stripped and the
 * document locale becomes the target locale, so the result is a valid
 * single-locale document that can be parsed or compiled again.
 */
export function applyTranslation(
  document: SothspellDocument,
  locale: string,
): SothspellDocument {
  if (locale === sourceLocaleOf(document)) {
    return document;
  }
  const translation = document.translations?.[locale];
  if (!translation) {
    throw new Error(`the tour has no ${locale} translation`);
  }

  return {
    ...document,
    schemaVersion: SCHEMA_VERSION,
    locale: translation.locale,
    title: translation.title,
    subtitle: translation.subtitle,
    chapters: document.chapters.map((chapter, chapterIndex) => {
      const translatedChapter = translation.chapters[chapterIndex];
      if (!translatedChapter) {
        return chapter;
      }
      return {
        ...chapter,
        title: translatedChapter.title,
        summary: translatedChapter.summary,
        diagrams: chapter.diagrams.map((diagram, diagramIndex) => {
          const translatedDiagram = translatedChapter.diagrams[diagramIndex];
          if (!translatedDiagram) {
            return diagram;
          }
          return {
            ...diagram,
            title: translatedDiagram.title,
            nodes: diagram.nodes.map((node) => {
              const label = translatedDiagram.nodeLabels?.[node.id];
              return label === undefined ? node : { ...node, label };
            }),
            edges: diagram.edges.map((edge) => {
              const label = translatedDiagram.edgeLabels?.[edge.id];
              return label === undefined ? edge : { ...edge, label };
            }),
          };
        }),
        beats: chapter.beats.map((beat, beatIndex) => {
          const translatedBeat = translatedChapter.beats[beatIndex];
          if (!translatedBeat) {
            return beat;
          }
          return {
            ...beat,
            title: translatedBeat.title,
            narration: translatedBeat.narration,
            ...(translatedBeat.suggestedQuestions === undefined
              ? {}
              : { suggestedQuestions: translatedBeat.suggestedQuestions }),
          };
        }),
      };
    }),
    translations: undefined,
  };
}
