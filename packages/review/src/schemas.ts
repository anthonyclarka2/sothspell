import { z } from 'zod';

/**
 * The review domain shapes. A review session is the audit trail for one
 * generated sóþspell revision: who reviewed it, what they said, what they
 * changed, and what they decided. The schemas live here so the API, the CLI,
 * and the browser all speak the same record.
 */

export const ReviewStateSchema = z.enum(['draft', 'in_review', 'approved', 'rejected']);
export type ReviewState = z.infer<typeof ReviewStateSchema>;

/** One validation problem, addressable to a form field by the UI. */
export const ReviewIssueSchema = z.object({
  field: z.string().min(1),
  message: z.string().min(1),
});
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;

/** The diagram focus a reviewer can edit; anchors are fixed per beat. */
export const DiagramFocusSchema = z.object({
  diagramId: z.string().min(1).nullable(),
  nodeIds: z.array(z.string().min(1)).max(16),
  edgeIds: z.array(z.string().min(1)).max(24),
});
export type DiagramFocus = z.infer<typeof DiagramFocusSchema>;

/** The strict shape of an edited beat; semantic rules live in `validate.ts`. */
export const BeatEditInputSchema = z.object({
  title: z.string().min(1).max(96),
  narration: z.string().min(20).max(1200),
  suggestedQuestions: z.array(z.string().min(4).max(240)).max(3),
  diagramFocus: DiagramFocusSchema,
});
export type BeatEditInput = z.infer<typeof BeatEditInputSchema>;

/**
 * A partial edit as it arrives over HTTP. The service merges it with the
 * current beat and then applies the strict rules, so every caller sees the
 * same named issues.
 */
export const BeatEditPatchSchema = z.object({
  title: z.string().optional(),
  narration: z.string().optional(),
  suggestedQuestions: z.array(z.string()).max(8).optional(),
  diagramFocus: DiagramFocusSchema.optional(),
});
export type BeatEditPatch = z.infer<typeof BeatEditPatchSchema>;

export const BeatEditSchema = BeatEditInputSchema.extend({
  id: z.string().min(1),
  beatId: z.string().min(1),
  /** Why the edit exists: a human, a regeneration, or a revert. */
  source: z.enum(['manual', 'regeneration', 'revert']),
  reviewer: z.string().min(1).max(96),
  createdAt: z.string(),
});
export type BeatEdit = z.infer<typeof BeatEditSchema>;

export const BeatSnapshotSchema = z.object({
  title: z.string(),
  narration: z.string(),
  suggestedQuestions: z.array(z.string()),
  diagramFocus: DiagramFocusSchema,
});
export type BeatSnapshot = z.infer<typeof BeatSnapshotSchema>;

export const BeatRegenerationSchema = z.object({
  id: z.string().min(1),
  beatId: z.string().min(1),
  previous: BeatSnapshotSchema,
  generated: BeatSnapshotSchema,
  modelId: z.string().min(1),
  createdAt: z.string(),
  revertedAt: z.string().nullable(),
  /** The edit record that applied the generated values. */
  editId: z.string().min(1),
});
export type BeatRegeneration = z.infer<typeof BeatRegenerationSchema>;

export const ReviewCommentSchema = z.object({
  id: z.string().min(1),
  beatId: z.string().nullable(),
  author: z.string().min(1).max(96),
  body: z.string().min(1).max(4000),
  createdAt: z.string(),
});
export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

export const CommentInputSchema = z.object({
  beatId: z.string().min(1).max(128).nullable().optional(),
  body: z.string().min(1).max(4000),
  author: z.string().min(1).max(96).optional(),
});
export type CommentInput = z.infer<typeof CommentInputSchema>;

/**
 * The outcome of one anchor check. `status` is the named reason an approval
 * gate reads; `detail` is the human sentence shown beside it.
 */
export const AnchorCheckSchema = z.object({
  anchorId: z.string().min(1),
  beatId: z.string().min(1),
  path: z.string().min(1),
  status: z.enum(['verified', 'mismatch', 'missing', 'unreadable', 'unverifiable']),
  expectedHash: z.string().min(1),
  liveHash: z.string().nullable(),
  detail: z.string().min(1),
});
export type AnchorCheck = z.infer<typeof AnchorCheckSchema>;

export const AnchorVerificationSchema = z.object({
  checkedAt: z.string(),
  ok: z.boolean(),
  checks: z.array(AnchorCheckSchema),
});
export type AnchorVerification = z.infer<typeof AnchorVerificationSchema>;

export const ReviewDecisionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['approved', 'rejected']),
  reviewer: z.string().min(1).max(96),
  reason: z.string().nullable(),
  anchorVerification: AnchorVerificationSchema.nullable(),
  /** True when the reviewer approved over a quality report that flagged concerns. */
  qualityOverride: z.boolean(),
  decidedAt: z.string(),
});
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

export const DecideInputSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(2000).optional(),
  reviewer: z.string().min(1).max(96).optional(),
});
export type DecideInput = z.infer<typeof DecideInputSchema>;

export const StartReviewInputSchema = z.object({
  tourId: z.string().min(1).max(256),
  reviewer: z.string().min(1).max(96).optional(),
});
export type StartReviewInput = z.infer<typeof StartReviewInputSchema>;

export const ReviewSessionSchema = z.object({
  id: z.string().min(1),
  tourId: z.string().min(1),
  /** Content hash of the tour document the review started against. */
  tourRevision: z.string().min(1),
  state: ReviewStateSchema,
  reviewer: z.string().min(1).max(96),
  createdAt: z.string(),
  updatedAt: z.string(),
  comments: z.array(ReviewCommentSchema),
  edits: z.array(BeatEditSchema),
  regenerations: z.array(BeatRegenerationSchema),
  decisions: z.array(ReviewDecisionSchema),
});
export type ReviewSession = z.infer<typeof ReviewSessionSchema>;

/**
 * The authoring quality report as the review sees it. It is input, not a gate:
 * the reviewer can approve over it, and the decision records the override.
 */
export const ReviewQualitySchema = z.object({
  planChapters: z.number().int(),
  chapters: z.number().int(),
  beats: z.number().int(),
  anchors: z.number().int(),
  droppedChapters: z.number().int(),
  issues: z.array(z.string()),
  modelCalls: z.number().int(),
  cacheHits: z.number().int(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number(),
  }),
  promptVersion: z.string(),
  modelId: z.string(),
  profileName: z.string().optional(),
  estimatedDurationMs: z.number().int(),
});
export type ReviewQuality = z.infer<typeof ReviewQualitySchema>;

/** True when the quality report names anything the reviewer should weigh. */
export function hasQualityConcerns(quality: ReviewQuality | null): boolean {
  return quality !== null && (quality.issues.length > 0 || quality.droppedChapters > 0);
}

export const ReviewListFilterSchema = z.object({
  tourId: z.string().min(1).max(256).optional(),
  state: ReviewStateSchema.optional(),
});
export type ReviewListFilter = z.infer<typeof ReviewListFilterSchema>;
