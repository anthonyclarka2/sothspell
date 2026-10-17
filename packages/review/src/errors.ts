import type { ReviewIssue } from './schemas.js';

/**
 * The review service's error surface. Every failure the API or the CLI must
 * explain carries a stable code: `anchor_verification_failed` is the approval
 * gate, `reason_required` is the rejection guard, and so on.
 */

export type ReviewErrorCode =
  | 'not_found'
  | 'unknown_beat'
  | 'invalid_input'
  | 'review_closed'
  | 'invalid_transition'
  | 'reason_required'
  | 'anchor_verification_failed'
  | 'reviewer_mismatch'
  | 'model_unavailable'
  | 'regeneration_failed';

export class ReviewError extends Error {
  readonly code: ReviewErrorCode;
  readonly details: string[];
  readonly issues: ReviewIssue[];

  constructor(
    code: ReviewErrorCode,
    message: string,
    input: { details?: string[]; issues?: ReviewIssue[] } = {},
  ) {
    super(
      input.details && input.details.length > 0
        ? `${message}: ${input.details.join('; ')}`
        : message,
    );
    this.name = 'ReviewError';
    this.code = code;
    this.details = input.details ?? [];
    this.issues = input.issues ?? [];
  }
}
