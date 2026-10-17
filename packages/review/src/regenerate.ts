import {
  loadPrompt,
  BeatDraftSchema,
  type BeatDraft,
  type GuideModel,
} from '@sothspell/authoring';
import type { Beat, Chapter, SothspellDocument } from '@sothspell/core';
import type { ReviewIssue } from './schemas.js';
import { wordCount, NARRATION_WORD_MAX, NARRATION_WORD_MIN } from './validate.js';

/**
 * One-beat regeneration. The beat keeps its anchors — the reviewer regenerates
 * the words, not the evidence — and the model sees only the beat's own
 * evidence plus its chapter context. The caller stores the previous narration
 * so the change can be diffed or reverted.
 */

export const REGENERATION_PROMPT_VERSION = '1.0.0';

export interface RegenerationInput {
  document: SothspellDocument;
  chapter: Chapter;
  beat: Beat;
}

function anchorEvidence(beat: Beat): string {
  return beat.anchors
    .map((anchor) =>
      [
        `- id: ${anchor.id}`,
        `  path: ${anchor.path}${anchor.symbol ? ` (symbol ${anchor.symbol})` : ''}`,
        `  lines: ${anchor.lines.start}-${anchor.lines.end}`,
        `  excerpt:`,
        (anchor.excerpt ?? '')
          .split('\n')
          .map((line) => `    ${line}`)
          .join('\n'),
      ].join('\n'),
    )
    .join('\n');
}

function neighbourBeats(chapter: Chapter, beatId: string): string {
  const index = chapter.beats.findIndex((beat) => beat.id === beatId);
  const neighbours = [chapter.beats[index - 1], chapter.beats[index + 1]].filter(
    (candidate): candidate is Beat => candidate !== undefined,
  );
  if (neighbours.length === 0) {
    return "This is the chapter's only beat.";
  }
  return neighbours.map((beat) => `- ${beat.title}: ${beat.narration}`).join('\n');
}

export function buildBeatRegenerationPrompt(input: RegenerationInput): string {
  const { document, chapter, beat } = input;
  const focus = beat.stage;
  return [
    "Rewrite one beat of an existing Sóþspell tour. Keep the beat's evidence and",
    'focus; change only the words. Return JSON matching the requested BeatDraft',
    'schema: a short title, 40–120 words of narration, the same anchor IDs as the',
    'current beat, optional node and edge IDs from the chapter diagram, and up to',
    'three suggested questions.',
    '',
    `Project: ${document.project.name} (${document.project.slug}) at ${document.project.revision.commit}`,
    `Audience: ${document.audience}`,
    `Tour: ${document.title} — ${document.subtitle}`,
    `Chapter: ${chapter.title} — ${chapter.summary}`,
    '',
    'Neighbouring beats (keep the tour continuous, do not repeat them):',
    neighbourBeats(chapter, beat.id),
    '',
    'Current beat:',
    `- title: ${beat.title}`,
    `- narration: ${beat.narration}`,
    `- focused nodes: ${(focus.nodeIds ?? []).join(', ') || 'none'}`,
    `- focused edges: ${(focus.edgeIds ?? []).join(', ') || 'none'}`,
    `- suggested questions: ${(beat.suggestedQuestions ?? []).join(' | ') || 'none'}`,
    '',
    'Anchor evidence (cite these exact IDs; do not invent files, symbols, or behavior):',
    anchorEvidence(beat),
    '',
    'Write a fresh narration that explains the same evidence in a different,',
    'concrete way. Do not change the anchor IDs. Keep the same diagram focus',
    'unless the evidence no longer supports it.',
  ].join('\n');
}

export interface GenerateBeatRegenerationInput extends RegenerationInput {
  model: GuideModel;
  /** Reuses a previous result for an unchanged prompt; cost control, not a cache of record. */
  cache?: Map<string, BeatDraft> | null;
  cacheKey?: string;
}

export async function generateBeatRegeneration(
  input: GenerateBeatRegenerationInput,
): Promise<BeatDraft> {
  const prompt = buildBeatRegenerationPrompt(input);
  const cacheKey = input.cacheKey;

  if (input.cache && cacheKey) {
    const cached = input.cache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const result = await input.model.generateObject({
    schema: BeatDraftSchema,
    schemaName: 'BeatDraft',
    system: loadPrompt('system'),
    prompt,
  });
  const draft = BeatDraftSchema.parse(result.value);

  if (input.cache && cacheKey) {
    input.cache.set(cacheKey, draft);
  }
  return draft;
}

/**
 * A regenerated beat must keep the beat's anchors and stay inside its chapter
 * diagram. Anything else is rejected with named issues rather than stored.
 */
export function validateRegeneratedBeat(
  draft: BeatDraft,
  input: RegenerationInput,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const { chapter, beat } = input;

  const expectedAnchors = new Set(beat.anchors.map((anchor) => anchor.id));
  const citedAnchors = new Set(draft.anchorIds);
  const missing = [...expectedAnchors].filter((id) => !citedAnchors.has(id));
  const extra = [...citedAnchors].filter((id) => !expectedAnchors.has(id));
  if (missing.length > 0 || extra.length > 0) {
    issues.push({
      field: 'anchorIds',
      message: `a regenerated beat must cite its anchors unchanged (missing: ${
        missing.join(', ') || 'none'
      }; unknown: ${extra.join(', ') || 'none'})`,
    });
  }

  const words = wordCount(draft.narration);
  if (words < NARRATION_WORD_MIN || words > NARRATION_WORD_MAX) {
    issues.push({
      field: 'narration',
      message: `narration is ${words} words; the authoring bound is ${NARRATION_WORD_MIN}–${NARRATION_WORD_MAX}`,
    });
  }

  const normalizedTitle = draft.title.trim().toLowerCase();
  for (const candidate of chapter.beats) {
    if (candidate.id === beat.id) {
      continue;
    }
    if (candidate.title.trim().toLowerCase() === normalizedTitle) {
      issues.push({
        field: 'title',
        message: `another beat in this chapter is already titled "${candidate.title}"`,
      });
    }
  }

  const diagram = chapter.diagrams.find(
    (candidate) => candidate.id === beat.stage.diagramId,
  );
  if (diagram) {
    const nodeIds = new Set(diagram.nodes.map((node) => node.id));
    const edgeIds = new Set(diagram.edges.map((edge) => edge.id));
    for (const nodeId of draft.nodeIds ?? []) {
      if (!nodeIds.has(nodeId)) {
        issues.push({
          field: 'nodeIds',
          message: `diagram ${diagram.id} has no node ${nodeId}`,
        });
      }
    }
    for (const edgeId of draft.edgeIds ?? []) {
      if (!edgeIds.has(edgeId)) {
        issues.push({
          field: 'edgeIds',
          message: `diagram ${diagram.id} has no edge ${edgeId}`,
        });
      }
    }
  } else if ((draft.nodeIds?.length ?? 0) > 0 || (draft.edgeIds?.length ?? 0) > 0) {
    issues.push({
      field: 'nodeIds',
      message: 'the beat has no diagram, so it cannot focus diagram elements',
    });
  }

  return issues;
}
