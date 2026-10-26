import {
  DEFAULT_LOCALE,
  parseSothspell,
  SCHEMA_VERSION,
  type CodeAnchor,
  type SothspellDocument,
} from '@sothspell/core';
import { DiagramInstructionSchema, type DiagramInstruction } from '@sothspell/diagram';
import type { ProjectSnapshot } from '@sothspell/analyzer';
import type { AnchorCandidate } from './context.js';
import type { ChapterDraft, ChapterPlan, TourPlan } from './schemas.js';

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return slug.length > 1 ? slug : 'item';
}

function estimateDurationMs(narration: string): number {
  const words = narration.trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(6000, Math.round((words / 2.5) * 1000));
}

function anchorFor(
  candidate: AnchorCandidate,
  beatId: string,
  index: number,
): CodeAnchor {
  return {
    id: `${beatId}_anchor_${index + 1}`,
    path: candidate.path,
    ...(candidate.symbol.length > 0 ? { symbol: candidate.symbol } : {}),
    // The candidate ID is the analyzer symbol ID; keeping it here lets the
    // canvas open the definition even when the beat cites a line range.
    symbolId: candidate.id,
    lines: candidate.lines,
    contentHash: candidate.contentHash,
    label: candidate.label,
    language: candidate.language,
    excerpt: candidate.excerpt,
  };
}

/**
 * Generated drafts cite anchor candidates from diagram nodes through
 * `anchorId`. That value is a symbol ID, not an anchor ID, so it belongs in
 * `symbolId`. A draft that cites a real anchor ID keeps it untouched.
 */
function attachSymbolTargets(
  diagram: DiagramInstruction,
  candidateById: Map<string, AnchorCandidate>,
): DiagramInstruction {
  return {
    ...diagram,
    nodes: diagram.nodes.map((node) => {
      if (node.anchorId === undefined || !candidateById.has(node.anchorId)) {
        return node;
      }
      const next = { ...node };
      const candidateId = next.anchorId!;
      delete next.anchorId;
      next.symbolId ??= candidateId;
      return next;
    }),
  };
}

/**
 * Turns validated model drafts into the portable Sóþspell document. This is the
 * only place where model output becomes an artifact; IDs are normalized, anchors
 * are resolved, and the core schema gets the final word.
 */
export function assembleDocument(input: {
  plan: TourPlan;
  chapters: Array<{ plan: ChapterPlan; draft: ChapterDraft }>;
  candidates: AnchorCandidate[];
  snapshot: ProjectSnapshot;
}): SothspellDocument {
  const candidateById = new Map(
    input.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const usedBeatIds = new Set<string>();

  const chapters = input.chapters.map((entry, chapterIndex) => {
    const chapterSlug = `${chapterIndex + 1}_${slugify(entry.draft.title)}`;
    const chapterId = `chapter_${chapterSlug}`;
    const diagramId = `diagram_${chapterSlug}`;

    const parsedDiagram = DiagramInstructionSchema.parse({
      ...entry.draft.diagram,
      id: diagramId,
      title: entry.draft.diagram.title || entry.draft.title,
    });
    const diagram = attachSymbolTargets(parsedDiagram, candidateById);

    const beats = entry.draft.beats.map((beat, beatIndex) => {
      let beatId = `beat_${chapterSlug}_${beatIndex + 1}`;
      let suffix = 2;
      while (usedBeatIds.has(beatId)) {
        beatId = `beat_${chapterSlug}_${beatIndex + 1}_${suffix}`;
        suffix += 1;
      }
      usedBeatIds.add(beatId);

      const anchors = beat.anchorIds.map((anchorId, anchorIndex) => {
        const candidate = candidateById.get(anchorId);
        if (!candidate) {
          throw new Error(`unknown anchor ${anchorId} while assembling ${beat.title}`);
        }
        return anchorFor(candidate, beatId, anchorIndex);
      });

      const nodeIds = (beat.nodeIds ?? []).filter((nodeId) =>
        diagram.nodes.some((node) => node.id === nodeId),
      );
      const edgeIds = (beat.edgeIds ?? []).filter((edgeId) =>
        diagram.edges.some((edge) => edge.id === edgeId),
      );

      return {
        id: beatId,
        title: beat.title,
        narration: beat.narration,
        durationMs: beat.durationMs ?? estimateDurationMs(beat.narration),
        anchors,
        stage: {
          anchorIds: anchors.map((anchor) => anchor.id),
          diagramId,
          nodeIds,
          edgeIds,
        },
        ...(beat.suggestedQuestions === undefined
          ? {}
          : { suggestedQuestions: beat.suggestedQuestions }),
      };
    });

    return {
      id: chapterId,
      title: entry.draft.title,
      summary: entry.draft.summary,
      diagrams: [diagram],
      beats,
    };
  });

  const document = {
    schemaVersion: SCHEMA_VERSION,
    id: `tour_${input.snapshot.project.slug}_${input.snapshot.id.slice(-8)}`,
    title: input.plan.title,
    subtitle: input.plan.subtitle,
    audience: input.plan.audience,
    locale: DEFAULT_LOCALE,
    project: {
      slug: input.snapshot.project.slug,
      name: input.snapshot.project.name,
      revision: {
        commit: input.snapshot.revision.commit ?? 'no-git',
        branch: input.snapshot.revision.branch,
        dirty: input.snapshot.revision.dirty,
      },
    },
    chapters,
  };

  return parseSothspell(document);
}

export function totalDurationMs(document: SothspellDocument): number {
  return document.chapters
    .flatMap((chapter) => chapter.beats)
    .reduce(
      (total, beat) => total + (beat.durationMs ?? estimateDurationMs(beat.narration)),
      0,
    );
}
