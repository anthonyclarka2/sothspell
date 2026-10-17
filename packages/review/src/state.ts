import { ReviewError } from './errors.js';
import type { AnchorVerification, ReviewState } from './schemas.js';

/**
 * The review state machine, as pure functions. `draft → in_review → approved
 * | rejected`; an edit reopens a decided review because the artifact under
 * review has changed. Guards are explicit so a failure carries a named code
 * the API, the CLI, and the UI can explain.
 */

export type ReviewGuardCode =
  | 'invalid_transition'
  | 'reason_required'
  | 'anchor_verification_failed'
  | 'review_closed'
  | 'reviewer_mismatch';

export class ReviewGuardError extends ReviewError {
  constructor(code: ReviewGuardCode, message: string, details: string[] = []) {
    super(code, message, { details });
    this.name = 'ReviewGuardError';
  }
}

const DECIDED_STATES: readonly ReviewState[] = ['approved', 'rejected'];

export function isDecided(state: ReviewState): boolean {
  return DECIDED_STATES.includes(state);
}

/** Starts a draft review. */
export function startReview(state: ReviewState): ReviewState {
  if (state !== 'draft') {
    throw new ReviewGuardError(
      'invalid_transition',
      `cannot start a review in state ${state}`,
    );
  }
  return 'in_review';
}

/**
 * The state after a beat edit. An edit reopens a decided review: the artifact
 * the decision was made against no longer exists.
 */
export function stateAfterEdit(state: ReviewState): ReviewState {
  return isDecided(state) ? 'in_review' : state;
}

export function assertCanComment(state: ReviewState): void {
  if (isDecided(state)) {
    throw new ReviewGuardError(
      'review_closed',
      `the review is ${state}; reopen it with a beat edit before commenting`,
    );
  }
}

export function assertCanDecide(
  state: ReviewState,
  kind: 'approve' | 'reject',
  reason: string | null,
): void {
  if (state !== 'in_review') {
    throw new ReviewGuardError(
      'invalid_transition',
      `cannot decide a review in state ${state}`,
    );
  }
  if (kind === 'reject' && (reason === null || reason.trim().length === 0)) {
    throw new ReviewGuardError('reason_required', 'a rejection requires a reason');
  }
}

/**
 * The approval gate. Every anchor must verify against fresh evidence; a stale
 * or missing anchor blocks approval with its own named reason.
 */
export function assertApprovalAllowed(verification: AnchorVerification): void {
  const failed = verification.checks.filter((check) => check.status !== 'verified');
  if (failed.length === 0) {
    return;
  }
  throw new ReviewGuardError(
    'anchor_verification_failed',
    `approval is blocked: ${failed.length} anchor(s) did not verify`,
    failed.map((check) => `${check.anchorId} (${check.status}: ${check.detail})`),
  );
}

/**
 * Permission mapping for the local-first model. A `local` review accepts any
 * local actor; a review bound to a named reviewer (a signed-in login later)
 * only accepts that reviewer.
 */
export function assertReviewer(sessionReviewer: string, actor: string | undefined): void {
  if (actor === undefined || actor === sessionReviewer || sessionReviewer === 'local') {
    return;
  }
  throw new ReviewGuardError(
    'reviewer_mismatch',
    `this review belongs to ${sessionReviewer}; ${actor} cannot act on it`,
  );
}

/** The actor recorded for a mutation: the request's reviewer, else the session's. */
export function resolveActor(sessionReviewer: string, actor: string | undefined): string {
  return actor ?? sessionReviewer;
}
