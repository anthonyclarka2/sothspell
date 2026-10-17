import { parseSothspell, type SothspellDocument } from '@sothspell/core';
import type { ProjectSnapshot } from '@sothspell/analyzer';
import type { GuideModel } from './model.js';
import { loadPrompt, renderPrompt } from './prompts.js';
import { ChapterDraftSchema, type ChapterPlan, type TourPlan } from './schemas.js';
import { validateChapterDraft } from './validate.js';
import { assembleDocument } from './assemble.js';
import type { AnchorCandidate } from './context.js';

export interface DrilldownInput {
  tour: SothspellDocument;
  anchorId: string;
  snapshot: ProjectSnapshot;
  sourceRoot: string;
  model: GuideModel;
}

export interface DrilldownResult {
  document: SothspellDocument;
  anchorId: string;
  beats: number;
}

function candidateFromTour(
  tour: SothspellDocument,
  anchorId: string,
): AnchorCandidate | null {
  for (const chapter of tour.chapters) {
    for (const beat of chapter.beats) {
      const anchor = beat.anchors.find((entry) => entry.id === anchorId);
      if (anchor) {
        return {
          id: anchor.id,
          label: anchor.label ?? anchor.symbol ?? anchor.path,
          path: anchor.path,
          symbol: anchor.symbol ?? '',
          lines: { start: anchor.lines.start, end: anchor.lines.end },
          excerpt: anchor.excerpt ?? '',
          language: anchor.language ?? 'text',
          contentHash: anchor.contentHash,
        };
      }
    }
  }
  return null;
}

/**
 * Generates a small side tour for one anchor. The result is a normal Sóþspell
 * document with one chapter, so the player and compiler treat it like any other
 * tour; the caller links it to the parent beat.
 */
export async function generateDrilldown(
  input: DrilldownInput,
): Promise<DrilldownResult> {
  const target = candidateFromTour(input.tour, input.anchorId);
  if (!target) {
    throw new Error(`unknown anchor: ${input.anchorId}`);
  }

  const nearby: AnchorCandidate[] = [];
  for (const chapter of input.tour.chapters) {
    for (const beat of chapter.beats) {
      for (const anchor of beat.anchors) {
        if (nearby.length >= 8 || anchor.id === input.anchorId) {
          continue;
        }
        if (anchor.path === target.path || beat.anchors.some((a) => a.id === input.anchorId)) {
          nearby.push({
            id: anchor.id,
            label: anchor.label ?? anchor.symbol ?? anchor.path,
            path: anchor.path,
            symbol: anchor.symbol ?? '',
            lines: { start: anchor.lines.start, end: anchor.lines.end },
            excerpt: anchor.excerpt ?? '',
            language: anchor.language ?? 'text',
            contentHash: anchor.contentHash,
          });
        }
      }
    }
  }

  const candidates = [target, ...nearby];
  const result = await input.model.generateObject({
    schema: ChapterDraftSchema,
    schemaName: 'ChapterDraft',
    system: loadPrompt('system'),
    prompt: renderPrompt(loadPrompt('drilldown'), {
      target,
      candidates,
      context: {
        title: input.tour.title,
        subtitle: input.tour.subtitle,
        chapter: input.tour.chapters[0]?.title,
      },
    }),
  });

  const draft = ChapterDraftSchema.parse(result.value);
  const planChapter: ChapterPlan = {
    title: draft.title,
    summary: draft.summary,
    goal: `Explain ${target.label} and its nearest boundary.`,
    beatBudget: draft.beats.length,
    coverage: [target.id],
  };
  const issues = validateChapterDraft(draft, planChapter, candidates);
  if (issues.length > 0) {
    throw new Error(`drilldown did not pass validation: ${issues.join('; ')}`);
  }

  const plan: TourPlan = {
    title: `${input.tour.title} — deeper`,
    subtitle: `A closer look at ${target.label}`,
    audience: input.tour.audience,
    chapters: [planChapter, planChapter, planChapter],
  };

  const document = assembleDocument({
    plan,
    chapters: [{ plan: planChapter, draft }],
    candidates,
    snapshot: input.snapshot,
  });

  return {
    document: parseSothspell(document),
    anchorId: input.anchorId,
    beats: document.chapters[0]?.beats.length ?? 0,
  };
}
