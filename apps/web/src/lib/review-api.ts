import type { CompiledTour } from '@sothspell/core';

/**
 * The browser-side review client. It speaks only to `/api/reviews`; the review
 * record is the audit trail, so nothing here writes to a tour document.
 */

export type ReviewState = 'draft' | 'in_review' | 'approved' | 'rejected';

export interface ReviewIssue {
  field: string;
  message: string;
}

export interface DiagramFocus {
  diagramId: string | null;
  nodeIds: string[];
  edgeIds: string[];
}

export interface BeatEdit {
  id: string;
  beatId: string;
  source: 'manual' | 'regeneration' | 'revert';
  reviewer: string;
  createdAt: string;
  title: string;
  narration: string;
  suggestedQuestions: string[];
  diagramFocus: DiagramFocus;
}

export interface BeatSnapshot {
  title: string;
  narration: string;
  suggestedQuestions: string[];
  diagramFocus: DiagramFocus;
}

export interface BeatRegeneration {
  id: string;
  beatId: string;
  previous: BeatSnapshot;
  generated: BeatSnapshot;
  modelId: string;
  createdAt: string;
  revertedAt: string | null;
  editId: string;
}

export interface ReviewComment {
  id: string;
  beatId: string | null;
  author: string;
  body: string;
  createdAt: string;
}

export interface AnchorCheck {
  anchorId: string;
  beatId: string;
  path: string;
  status: 'verified' | 'mismatch' | 'missing' | 'unreadable' | 'unverifiable';
  expectedHash: string;
  liveHash: string | null;
  detail: string;
}

export interface AnchorVerification {
  checkedAt: string;
  ok: boolean;
  checks: AnchorCheck[];
}

export interface ReviewDecision {
  id: string;
  kind: 'approved' | 'rejected';
  reviewer: string;
  reason: string | null;
  anchorVerification: AnchorVerification | null;
  qualityOverride: boolean;
  decidedAt: string;
}

export interface ReviewSession {
  id: string;
  tourId: string;
  tourRevision: string;
  state: ReviewState;
  reviewer: string;
  createdAt: string;
  updatedAt: string;
  comments: ReviewComment[];
  edits: BeatEdit[];
  regenerations: BeatRegeneration[];
  decisions: ReviewDecision[];
}

export interface ReviewQuality {
  planChapters: number;
  chapters: number;
  beats: number;
  anchors: number;
  droppedChapters: number;
  issues: string[];
  modelCalls: number;
  cacheHits: number;
  modelId: string;
  profileName?: string;
  estimatedDurationMs: number;
}

export interface ReviewDetail {
  review: ReviewSession;
  tour: CompiledTour;
  quality: ReviewQuality | null;
  anchors: AnchorCheck[];
}

export interface BeatEditPatch {
  title?: string;
  narration?: string;
  suggestedQuestions?: string[];
  diagramFocus?: DiagramFocus;
}

export class ReviewApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: ReviewIssue[];
  readonly details: string[];

  constructor(
    message: string,
    status: number,
    code: string,
    issues: ReviewIssue[] = [],
    details: string[] = [],
  ) {
    super(message);
    this.name = 'ReviewApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.details = details;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      code?: string;
      issues?: ReviewIssue[];
      details?: string[];
    } | null;
    throw new ReviewApiError(
      body?.error ?? `request failed with ${response.status}`,
      response.status,
      body?.code ?? 'unknown',
      body?.issues ?? [],
      body?.details ?? [],
    );
  }
  return (await response.json()) as T;
}

export async function startReview(
  tourId: string,
  reviewer?: string,
): Promise<ReviewSession> {
  const response = await fetch('/api/reviews', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tourId, ...(reviewer === undefined ? {} : { reviewer }) }),
  });
  const body = await readJson<{ review: ReviewSession }>(response);
  return body.review;
}

export async function fetchReview(id: string): Promise<ReviewDetail> {
  return readJson<ReviewDetail>(await fetch(`/api/reviews/${encodeURIComponent(id)}`));
}

export async function addReviewComment(
  id: string,
  input: { beatId: string | null; body: string; author?: string },
): Promise<ReviewSession> {
  const response = await fetch(`/api/reviews/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return (await readJson<{ review: ReviewSession }>(response)).review;
}

export async function updateReviewBeat(
  id: string,
  beatId: string,
  patch: BeatEditPatch,
): Promise<ReviewSession> {
  const response = await fetch(
    `/api/reviews/${encodeURIComponent(id)}/beats/${encodeURIComponent(beatId)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  return (await readJson<{ review: ReviewSession }>(response)).review;
}

export async function regenerateReviewBeat(
  id: string,
  beatId: string,
): Promise<{ review: ReviewSession; regeneration: BeatRegeneration }> {
  const response = await fetch(
    `/api/reviews/${encodeURIComponent(id)}/beats/${encodeURIComponent(beatId)}/regenerate`,
    { method: 'POST' },
  );
  return readJson<{ review: ReviewSession; regeneration: BeatRegeneration }>(response);
}

export async function revertReviewRegeneration(
  id: string,
  regenerationId: string,
): Promise<ReviewSession> {
  const response = await fetch(
    `/api/reviews/${encodeURIComponent(id)}/regenerations/${encodeURIComponent(regenerationId)}/revert`,
    { method: 'POST' },
  );
  return (await readJson<{ review: ReviewSession }>(response)).review;
}

export async function decideReview(
  id: string,
  input: { decision: 'approve' | 'reject'; reason?: string; reviewer?: string },
): Promise<ReviewSession> {
  const response = await fetch(`/api/reviews/${encodeURIComponent(id)}/decide`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return (await readJson<{ review: ReviewSession }>(response)).review;
}

export function reviewExportUrl(id: string, format: 'markdown' | 'json'): string {
  return `/api/reviews/${encodeURIComponent(id)}/export?format=${format}`;
}

/** The latest applied regeneration for a beat, if any. */
export function latestRegeneration(
  session: ReviewSession,
  beatId: string,
): BeatRegeneration | null {
  for (let index = session.regenerations.length - 1; index >= 0; index -= 1) {
    const regeneration = session.regenerations[index];
    if (regeneration && regeneration.beatId === beatId) {
      return regeneration;
    }
  }
  return null;
}

export function commentsFor(
  session: ReviewSession,
  beatId: string | null,
): ReviewComment[] {
  return session.comments.filter((comment) => comment.beatId === beatId);
}
