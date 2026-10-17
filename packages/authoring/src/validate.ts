import type { ChapterDraft, ChapterPlan, TourPlan } from './schemas.js';
import type { AnchorCandidate } from './context.js';

function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

export function validatePlan(plan: TourPlan): string[] {
  const issues: string[] = [];
  const titles = new Set<string>();
  for (const chapter of plan.chapters) {
    const normalized = chapter.title.trim().toLowerCase();
    if (titles.has(normalized)) {
      issues.push(`duplicate chapter title: ${chapter.title}`);
    }
    titles.add(normalized);
    if (chapter.coverage.length === 0) {
      issues.push(`chapter ${chapter.title} has no coverage items`);
    }
  }

  const totalBeats = plan.chapters.reduce(
    (total, chapter) => total + chapter.beatBudget,
    0,
  );
  if (totalBeats < 8) {
    issues.push(`the plan has only ${totalBeats} planned beats; 8 or more are needed`);
  }
  if (totalBeats > 40) {
    issues.push(`the plan has ${totalBeats} planned beats; 40 is the upper bound`);
  }
  return issues;
}

export function validateChapterDraft(
  draft: ChapterDraft,
  plan: ChapterPlan,
  candidates: AnchorCandidate[],
): string[] {
  const issues: string[] = [];
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));

  if (draft.beats.length < Math.max(2, plan.beatBudget - 1)) {
    issues.push(
      `chapter ${draft.title} has ${draft.beats.length} beats; ${Math.max(2, plan.beatBudget - 1)} or more are expected`,
    );
  }
  if (draft.beats.length > Math.min(5, plan.beatBudget + 1)) {
    issues.push(
      `chapter ${draft.title} has ${draft.beats.length} beats; at most ${Math.min(5, plan.beatBudget + 1)} are expected`,
    );
  }

  const nodeIds = new Set(draft.diagram.nodes.map((node) => node.id));
  const edgeIds = new Set(draft.diagram.edges.map((edge) => edge.id));
  const beatTitles = new Set<string>();

  for (const beat of draft.beats) {
    const normalizedTitle = beat.title.trim().toLowerCase();
    if (beatTitles.has(normalizedTitle)) {
      issues.push(`duplicate beat title in ${draft.title}: ${beat.title}`);
    }
    beatTitles.add(normalizedTitle);

    const words = wordCount(beat.narration);
    if (words < 30 || words > 180) {
      issues.push(
        `beat ${beat.title} has ${words} words; narration must be 30–180 words`,
      );
    }

    if (beat.anchorIds.length === 0) {
      issues.push(`beat ${beat.title} has no anchors`);
    }
    for (const anchorId of beat.anchorIds) {
      if (!candidateIds.has(anchorId)) {
        issues.push(`beat ${beat.title} cites unknown anchor ${anchorId}`);
      }
    }
    for (const nodeId of beat.nodeIds ?? []) {
      if (!nodeIds.has(nodeId)) {
        issues.push(`beat ${beat.title} focuses unknown node ${nodeId}`);
      }
    }
    for (const edgeId of beat.edgeIds ?? []) {
      if (!edgeIds.has(edgeId)) {
        issues.push(`beat ${beat.title} focuses unknown edge ${edgeId}`);
      }
    }
  }

  for (const node of draft.diagram.nodes) {
    if (node.anchorId && !candidateIds.has(node.anchorId)) {
      issues.push(`diagram node ${node.id} cites unknown anchor ${node.anchorId}`);
    }
  }

  return issues;
}
