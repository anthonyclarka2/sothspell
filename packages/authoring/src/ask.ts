import { z } from 'zod';
import { readSourceRange } from '@sothspell/core';
import type { ProjectSnapshot } from '@sothspell/analyzer';
import type { SothspellDocument } from '@sothspell/core';
import type { GuideModel, ModelUsage } from './model.js';
import { loadPrompt, renderPrompt } from './prompts.js';
import { addUsage } from './model.js';

export const AskAnswerSchema = z.object({
  markdown: z.string().min(1).max(4000),
  citations: z.array(z.string().min(1)).max(8),
  followUps: z.array(z.string().min(4).max(200)).max(3),
  suggestedBeatId: z.string().min(1).optional(),
});

export type AskAnswer = z.infer<typeof AskAnswerSchema>;

export interface AskHistoryEntry {
  question: string;
  answer: string;
}

export interface AskQuestionInput {
  question: string;
  tour: SothspellDocument;
  beatId: string;
  snapshot: ProjectSnapshot;
  sourceRoot: string;
  model: GuideModel;
  history?: AskHistoryEntry[];
  signal?: AbortSignal;
}

export interface AskQuestionResult {
  answer: AskAnswer;
  usage?: ModelUsage;
  citations: Array<{ id: string; label: string; path: string; startLine: number; endLine: number }>;
  warnings: string[];
}

interface AnchorCandidate {
  id: string;
  label: string;
  path: string;
  startLine: number;
  endLine: number;
  excerpt: string;
}

function collectCandidates(
  tour: SothspellDocument,
  beatId: string,
): { currentBeat: SothspellDocument['chapters'][number]['beats'][number] | null; chapter: SothspellDocument['chapters'][number] | null; candidates: AnchorCandidate[]; outline: string[] } {
  let currentBeat = null;
  let chapter = null;
  const candidates: AnchorCandidate[] = [];
  const seen = new Set<string>();
  const outline: string[] = [];

  for (const tourChapter of tour.chapters) {
    outline.push(`${tourChapter.title}: ${tourChapter.summary}`);
    for (const beat of tourChapter.beats) {
      if (beat.id === beatId) {
        currentBeat = beat;
        chapter = tourChapter;
      }
      for (const anchor of beat.anchors) {
        if (seen.has(anchor.id)) {
          continue;
        }
        seen.add(anchor.id);
        candidates.push({
          id: anchor.id,
          label: anchor.label ?? anchor.symbol ?? anchor.path,
          path: anchor.path,
          startLine: anchor.lines.start,
          endLine: anchor.lines.end,
          excerpt: anchor.excerpt ?? '',
        });
      }
    }
  }

  return { currentBeat, chapter, candidates, outline };
}

async function fillExcerpts(
  candidates: AnchorCandidate[],
  sourceRoot: string,
): Promise<AnchorCandidate[]> {
  const filled: AnchorCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.excerpt.length > 0) {
      filled.push(candidate);
      continue;
    }
    try {
      const range = await readSourceRange(
        sourceRoot,
        candidate.path,
        candidate.startLine,
        candidate.endLine,
      );
      filled.push({ ...candidate, excerpt: range.text });
    } catch {
      // A candidate whose source cannot be read is not usable evidence.
    }
  }
  return filled;
}

/**
 * Answers a question inside a tour. The answer is an interlude, not a change to
 * the tour: the caller stores it with the run and resumes at the same offset.
 */
export async function answerQuestion(
  input: AskQuestionInput,
): Promise<AskQuestionResult> {
  const { currentBeat, chapter, candidates, outline } = collectCandidates(
    input.tour,
    input.beatId,
  );
  if (!currentBeat || !chapter) {
    throw new Error(`unknown beat: ${input.beatId}`);
  }

  const evidence = await fillExcerpts(
    candidates.filter(
      (candidate) =>
        currentBeat.anchors.some((anchor) => anchor.id === candidate.id) ||
        candidate.path === currentBeat.anchors[0]?.path,
    ),
    input.sourceRoot,
  );
  const nearby = await fillExcerpts(
    candidates
      .filter((candidate) => !evidence.some((entry) => entry.id === candidate.id))
      .slice(0, 6),
    input.sourceRoot,
  );

  const context = {
    tour: { title: input.tour.title, subtitle: input.tour.subtitle },
    chapter: { title: chapter.title, summary: chapter.summary },
    beat: {
      id: currentBeat.id,
      title: currentBeat.title,
      narration: currentBeat.narration,
    },
    outline,
    candidates: [...evidence, ...nearby],
    history: input.history ?? [],
  };

  const result = await input.model.generateObject({
    schema: AskAnswerSchema,
    schemaName: 'AskAnswer',
    system: loadPrompt('system'),
    prompt: renderPrompt(loadPrompt('ask'), {
      context,
      question: input.question,
    }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });

  const answer = AskAnswerSchema.parse(result.value);
  const candidateById = new Map(
    [...evidence, ...nearby].map((candidate) => [candidate.id, candidate]),
  );
  const warnings: string[] = [];
  const citations = answer.citations.filter((citation) => {
    if (candidateById.has(citation)) {
      return true;
    }
    warnings.push(`dropped unsupported citation: ${citation}`);
    return false;
  });

  if (citations.length === 0) {
    warnings.push('the answer did not cite a valid anchor');
  }

  return {
    answer: { ...answer, citations },
    ...(result.usage === undefined ? {} : { usage: result.usage }),
    citations: citations.map((citation) => {
      const candidate = candidateById.get(citation);
      return {
        id: citation,
        label: candidate?.label ?? citation,
        path: candidate?.path ?? '',
        startLine: candidate?.startLine ?? 0,
        endLine: candidate?.endLine ?? 0,
      };
    }),
    warnings,
  };
}

export function mergeUsage(
  left: ModelUsage | undefined,
  right: ModelUsage | undefined,
): ModelUsage {
  return addUsage(left, right);
}
