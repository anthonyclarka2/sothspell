import type { Chapter, SothspellDocument } from '@sothspell/core';
import { SothspellDocumentSchema } from '@sothspell/core';
import { applyBeatEdits } from './edits.js';
import {
  BeatEditInputSchema,
  type BeatEdit,
  type BeatEditInput,
  type ReviewIssue,
} from './schemas.js';

/**
 * Beat-scoped validation, run on save and after regeneration. It answers three
 * questions the review must not skip: does the beat still satisfy the tour
 * schema, does it still fit its chapter, and do its diagram references still
 * point at real nodes and edges? Anchors are fixed per beat, so an edit can
 * never silently drop evidence.
 */

/**
 * The authoring pipeline's narration bound, mirrored here so a regenerated
 * beat is held to the same standard as a written one. Manual edits get it as a
 * warning; a generated beat must pass it outright.
 */
export const NARRATION_WORD_MIN = 30;
export const NARRATION_WORD_MAX = 180;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

export interface BeatValidationContext {
  document: SothspellDocument;
  chapter: Chapter;
  /** The beat being edited; used to exclude it from duplicate-title checks. */
  beatId: string;
}

export interface BeatValidationResult {
  errors: ReviewIssue[];
  warnings: ReviewIssue[];
}

function schemaIssues(input: unknown): ReviewIssue[] {
  const parsed = BeatEditInputSchema.safeParse(input);
  if (parsed.success) {
    return [];
  }
  return parsed.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.') || 'beat',
    message: issue.message,
  }));
}

export function validateBeatEdit(
  input: BeatEditInput,
  context: BeatValidationContext,
): BeatValidationResult {
  const errors = schemaIssues(input);
  const warnings: ReviewIssue[] = [];

  if (errors.length > 0) {
    // Semantic checks read fields that may be missing; report the schema
    // problems first rather than piling on.
    return { errors, warnings };
  }

  const normalizedTitle = input.title.trim().toLowerCase();
  for (const beat of context.chapter.beats) {
    if (beat.id === context.beatId) {
      continue;
    }
    if (beat.title.trim().toLowerCase() === normalizedTitle) {
      errors.push({
        field: 'title',
        message: `another beat in this chapter is already titled "${beat.title}"`,
      });
    }
  }

  const words = wordCount(input.narration);
  if (words < NARRATION_WORD_MIN || words > NARRATION_WORD_MAX) {
    warnings.push({
      field: 'narration',
      message: `narration is ${words} words; the authoring bound is ${NARRATION_WORD_MIN}–${NARRATION_WORD_MAX}`,
    });
  }

  const focus = input.diagramFocus;
  if (focus.diagramId === null) {
    if (focus.nodeIds.length > 0 || focus.edgeIds.length > 0) {
      errors.push({
        field: 'diagramFocus.diagramId',
        message: 'a diagram focus needs a diagram',
      });
    }
    return { errors, warnings };
  }

  const diagram = context.chapter.diagrams.find(
    (candidate) => candidate.id === focus.diagramId,
  );
  if (!diagram) {
    errors.push({
      field: 'diagramFocus.diagramId',
      message: `chapter "${context.chapter.title}" has no diagram ${focus.diagramId}`,
    });
    return { errors, warnings };
  }

  const nodeIds = new Set(diagram.nodes.map((node) => node.id));
  const edgeIds = new Set(diagram.edges.map((edge) => edge.id));
  for (const nodeId of focus.nodeIds) {
    if (!nodeIds.has(nodeId)) {
      errors.push({
        field: 'diagramFocus.nodeIds',
        message: `diagram ${diagram.id} has no node ${nodeId}`,
      });
    }
  }
  for (const edgeId of focus.edgeIds) {
    if (!edgeIds.has(edgeId)) {
      errors.push({
        field: 'diagramFocus.edgeIds',
        message: `diagram ${diagram.id} has no edge ${edgeId}`,
      });
    }
  }

  return { errors, warnings };
}

/**
 * The final word on an edit: the whole document, with the candidate edit
 * applied, must still satisfy the tour schema. That schema cross-checks stage
 * references against declared anchors and diagram nodes, so an edit can never
 * leave a beat pointing at evidence that does not exist. This is the same
 * schema the compiler enforces at playback time.
 */
export function validateEffectiveDocument(
  document: SothspellDocument,
  edits: BeatEdit[],
): ReviewIssue[] {
  const parsed = SothspellDocumentSchema.safeParse(applyBeatEdits(document, edits));
  if (parsed.success) {
    return [];
  }
  return parsed.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.') || 'document',
    message: issue.message,
  }));
}
