import { z } from 'zod';
import { DiagramInstructionSchema } from '@sothspell/diagram';

export const SCHEMA_VERSION = '1.0.0' as const;

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

export const SothspellDocumentSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: z.string().min(1),
    title: z.string().min(1).max(96),
    subtitle: z.string().min(1).max(160),
    audience: z.enum(['new-contributor', 'technical-evaluator', 'maintainer']),
    project: ProjectRefSchema,
    estimatedDurationMs: z.number().int().min(60000).max(3600000).optional(),
    chapters: z.array(ChapterSchema).min(1).max(12),
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
  });

export type Revision = z.infer<typeof RevisionSchema>;
export type ProjectRef = z.infer<typeof ProjectRefSchema>;
export type CodeAnchor = z.infer<typeof CodeAnchorSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type SothspellDocument = z.infer<typeof SothspellDocumentSchema>;

/**
 * The single entry point for turning unknown input (an artifact on disk or a
 * model draft) into a document. Every other module may assume the semantic
 * checks have run: IDs are unique, stage references resolve, and every beat
 * carries code evidence.
 */
export function parseSothspell(input: unknown): SothspellDocument {
  return SothspellDocumentSchema.parse(input);
}
