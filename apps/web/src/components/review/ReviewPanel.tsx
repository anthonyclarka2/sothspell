import { useMemo, useState, type RefObject } from 'react';
import type { CompiledTour } from '@sothspell/core';
import {
  reviewExportUrl,
  type AnchorCheck,
  type ReviewQuality,
  type ReviewSession,
} from '../../lib/review-api.js';

interface ReviewPanelProps {
  session: ReviewSession;
  tour: CompiledTour;
  quality: ReviewQuality | null;
  anchors: AnchorCheck[];
  currentBeatId: string;
  busy: boolean;
  onComment: (input: { beatId: string | null; body: string }) => Promise<boolean>;
  onApprove: () => void;
  onReject: (reason: string) => Promise<boolean>;
  commentRef: RefObject<HTMLTextAreaElement | null>;
  rejectRef: RefObject<HTMLTextAreaElement | null>;
}

function beatTitle(tour: CompiledTour, beatId: string | null): string {
  if (beatId === null) {
    return 'Tour-level';
  }
  for (const chapter of tour.chapters) {
    const beat = chapter.beats.find((candidate) => candidate.id === beatId);
    if (beat) {
      return beat.title;
    }
  }
  return beatId;
}

function stateLabel(state: ReviewSession['state']): string {
  return state === 'in_review' ? 'in review' : state;
}

/**
 * The review panel: the decision surface. It shows the quality report as
 * input, the fresh anchor checks, the comment thread, the decision history,
 * and the approve/reject controls. Nothing here is colour-only: every state
 * and status carries text.
 */
export function ReviewPanel({
  session,
  tour,
  quality,
  anchors,
  currentBeatId,
  busy,
  onComment,
  onApprove,
  onReject,
  commentRef,
  rejectRef,
}: ReviewPanelProps) {
  const [commentBody, setCommentBody] = useState('');
  const [commentTarget, setCommentTarget] = useState<'beat' | 'tour'>('beat');
  const [rejectReason, setRejectReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const failedAnchors = useMemo(
    () => anchors.filter((check) => check.status !== 'verified'),
    [anchors],
  );
  const latestDecision = session.decisions.at(-1) ?? null;
  const decided = session.state === 'approved' || session.state === 'rejected';

  async function submitComment(): Promise<void> {
    const body = commentBody.trim();
    if (body.length === 0) {
      setFormError('Write a comment before saving it.');
      return;
    }
    setFormError(null);
    const saved = await onComment({
      beatId: commentTarget === 'beat' ? currentBeatId : null,
      body,
    });
    if (saved) {
      setCommentBody('');
    }
  }

  async function submitReject(): Promise<void> {
    const reason = rejectReason.trim();
    if (reason.length === 0) {
      setFormError('A rejection needs a reason.');
      rejectRef.current?.focus();
      return;
    }
    setFormError(null);
    const saved = await onReject(reason);
    if (saved) {
      setRejectReason('');
    }
  }

  return (
    <aside className="review-panel" aria-labelledby="review-panel-heading">
      <h2 id="review-panel-heading" tabIndex={-1} className="review-panel-heading">
        Review
      </h2>

      <section className="review-summary" aria-labelledby="review-summary-heading">
        <h3 id="review-summary-heading" className="visually-hidden">
          Review state
        </h3>
        <p className="review-state">
          <span className="review-badge" data-state={session.state}>
            {stateLabel(session.state)}
          </span>
          <span className="mono">reviewer {session.reviewer}</span>
        </p>
        <dl className="review-meta">
          <dt>Tour revision</dt>
          <dd className="mono">{session.tourRevision.slice(0, 19)}…</dd>
          <dt>Updated</dt>
          <dd className="mono">{session.updatedAt}</dd>
        </dl>
        <p className="review-export">
          <a href={reviewExportUrl(session.id, 'markdown')}>Export Markdown</a>
          {' · '}
          <a href={reviewExportUrl(session.id, 'json')}>Export JSON</a>
        </p>
      </section>

      <section className="review-quality" aria-labelledby="review-quality-heading">
        <h3 id="review-quality-heading">Quality report</h3>
        {quality === null ? (
          <p className="field-hint">No quality report was stored beside this tour.</p>
        ) : (
          <>
            <ul className="review-quality-list">
              <li>
                {quality.chapters} of {quality.planChapters} planned chapters ·{' '}
                {quality.beats} beats · {quality.anchors} anchors
              </li>
              <li>Model: {quality.modelId}</li>
              {quality.droppedChapters > 0 && (
                <li className="review-warning">
                  {quality.droppedChapters} dropped chapter
                  {quality.droppedChapters === 1 ? '' : 's'}
                </li>
              )}
            </ul>
            {quality.issues.length > 0 && (
              <ul className="review-quality-issues">
                {quality.issues.map((issue) => (
                  <li key={issue} className="review-warning">
                    {issue}
                  </li>
                ))}
              </ul>
            )}
            <p className="field-hint">
              The quality report is input, not a gate: approving over it records the
              override.
            </p>
          </>
        )}
      </section>

      <section
        className="review-anchor-status"
        aria-labelledby="review-anchor-status-heading"
      >
        <h3 id="review-anchor-status-heading">Anchor verification</h3>
        <p className="field-hint">
          {anchors.length} anchor{anchors.length === 1 ? '' : 's'} checked ·{' '}
          {anchors.length - failedAnchors.length} verified
        </p>
        {failedAnchors.length > 0 && (
          <ul className="review-anchor-failures">
            {failedAnchors.map((check) => (
              <li key={check.anchorId} className="review-warning">
                <span className="mono">{check.anchorId}</span> ({check.status}):{' '}
                {check.detail}
              </li>
            ))}
          </ul>
        )}
        <details className="review-anchor-details">
          <summary>All checks</summary>
          <ul>
            {anchors.map((check) => (
              <li key={check.anchorId}>
                <span className="mono">{check.anchorId}</span> — {check.status}
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="review-comments" aria-labelledby="review-comments-heading">
        <h3 id="review-comments-heading">Comments</h3>
        {session.comments.length === 0 ? (
          <p className="field-hint">No comments yet.</p>
        ) : (
          <ol className="review-comment-list">
            {session.comments.map((comment) => (
              <li className="review-comment" key={comment.id}>
                <p className="review-comment-meta">
                  <strong>{beatTitle(tour, comment.beatId)}</strong> · {comment.author} ·{' '}
                  <span className="mono">{comment.createdAt}</span>
                </p>
                <p className="review-comment-body">{comment.body}</p>
              </li>
            ))}
          </ol>
        )}

        <div className="field">
          <label htmlFor="review-comment-target">Comment on</label>
          <select
            id="review-comment-target"
            value={commentTarget}
            onChange={(event) =>
              setCommentTarget(event.target.value === 'tour' ? 'tour' : 'beat')
            }
          >
            <option value="beat">This beat — {beatTitle(tour, currentBeatId)}</option>
            <option value="tour">The whole tour</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="review-comment-body">Comment</label>
          <textarea
            id="review-comment-body"
            ref={commentRef}
            rows={3}
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
          />
        </div>
        <div className="review-form-actions">
          <button
            type="button"
            className="secondary-action"
            disabled={busy || decided}
            onClick={() => void submitComment()}
          >
            Add comment
          </button>
        </div>
        {decided && (
          <p className="field-hint">
            This review is {stateLabel(session.state)}; edit a beat to reopen it before
            commenting.
          </p>
        )}
      </section>

      <section className="review-decide" aria-labelledby="review-decide-heading">
        <h3 id="review-decide-heading">Decision</h3>

        {session.decisions.length > 0 && (
          <ol className="review-decision-list">
            {session.decisions.map((decision) => (
              <li key={decision.id}>
                <p>
                  <strong>{decision.kind}</strong> · {decision.reviewer} ·{' '}
                  <span className="mono">{decision.decidedAt}</span>
                </p>
                {decision.reason && (
                  <p className="review-comment-body">{decision.reason}</p>
                )}
                {decision.qualityOverride && (
                  <p className="review-warning">
                    Approved over a quality report that flagged concerns.
                  </p>
                )}
                {decision.anchorVerification && (
                  <p className="field-hint">
                    {decision.anchorVerification.checks.length} anchors verified at
                    approval.
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}

        {session.state === 'in_review' ? (
          <>
            <div className="review-form-actions">
              <button
                type="button"
                className="primary-action"
                disabled={busy}
                onClick={onApprove}
              >
                Approve review
              </button>
            </div>
            {failedAnchors.length > 0 && (
              <p className="review-warning">
                Approval will be blocked: {failedAnchors.length} anchor
                {failedAnchors.length === 1 ? '' : 's'} did not verify.
              </p>
            )}
            <div className="field">
              <label htmlFor="review-reject-reason">Rejection reason</label>
              <textarea
                id="review-reject-reason"
                ref={rejectRef}
                rows={2}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
              />
            </div>
            <div className="review-form-actions">
              <button
                type="button"
                className="secondary-action"
                disabled={busy}
                onClick={() => void submitReject()}
              >
                Reject review
              </button>
            </div>
          </>
        ) : (
          <p className="field-hint">
            This review is {stateLabel(session.state)}. Editing a beat reopens it.
          </p>
        )}

        {formError && (
          <p className="field-error" role="alert">
            {formError}
          </p>
        )}
      </section>

      {latestDecision === null && session.state === 'draft' && (
        <p className="field-hint">Start the review to record a decision.</p>
      )}
    </aside>
  );
}
