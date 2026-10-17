import { describe, expect, it } from 'vitest';
import {
  assertApprovalAllowed,
  assertCanComment,
  assertCanDecide,
  assertReviewer,
  isDecided,
  resolveActor,
  ReviewGuardError,
  startReview,
  stateAfterEdit,
} from './state.js';
import type { AnchorCheck, AnchorVerification } from './schemas.js';

function check(overrides: Partial<AnchorCheck> = {}): AnchorCheck {
  return {
    anchorId: 'anchor_readme',
    beatId: 'beat_one',
    path: 'README.md',
    status: 'verified',
    expectedHash: 'sha256:aaa',
    liveHash: 'sha256:aaa',
    detail: 'the live source matches the anchor hash',
    ...overrides,
  };
}

function verification(checks: AnchorCheck[]): AnchorVerification {
  return {
    checkedAt: '2026-10-17T00:00:00.000Z',
    ok: checks.every((candidate) => candidate.status === 'verified'),
    checks,
  };
}

describe('review state machine', () => {
  it('starts a draft review and refuses to restart a live one', () => {
    expect(startReview('draft')).toBe('in_review');
    expect(() => startReview('in_review')).toThrow(ReviewGuardError);
    expect(() => startReview('approved')).toThrow(/cannot start a review/);
  });

  it('reopens a decided review when a beat is edited', () => {
    expect(stateAfterEdit('draft')).toBe('draft');
    expect(stateAfterEdit('in_review')).toBe('in_review');
    expect(stateAfterEdit('approved')).toBe('in_review');
    expect(stateAfterEdit('rejected')).toBe('in_review');
    expect(isDecided('approved')).toBe(true);
    expect(isDecided('in_review')).toBe(false);
  });

  it('refuses a comment on a decided review with a named reason', () => {
    expect(() => assertCanComment('in_review')).not.toThrow();
    expect(() => assertCanComment('draft')).not.toThrow();
    try {
      assertCanComment('approved');
      expect.unreachable('a decided review must refuse comments');
    } catch (error) {
      expect(error).toBeInstanceOf(ReviewGuardError);
      expect((error as ReviewGuardError).code).toBe('review_closed');
      expect((error as ReviewGuardError).message).toMatch(/reopen it with a beat edit/);
    }
  });

  it('requires a reason to reject and none to approve', () => {
    expect(() => assertCanDecide('in_review', 'approve', null)).not.toThrow();
    expect(() =>
      assertCanDecide('in_review', 'reject', 'the claims are unsupported'),
    ).not.toThrow();

    try {
      assertCanDecide('in_review', 'reject', '   ');
      expect.unreachable('a rejection without a reason must fail');
    } catch (error) {
      expect((error as ReviewGuardError).code).toBe('reason_required');
    }

    try {
      assertCanDecide('rejected', 'approve', null);
      expect.unreachable('a decided review must not accept another decision');
    } catch (error) {
      expect((error as ReviewGuardError).code).toBe('invalid_transition');
    }
  });

  it('blocks approval when an anchor is stale, with the anchor named', () => {
    expect(() => assertApprovalAllowed(verification([check()]))).not.toThrow();

    try {
      assertApprovalAllowed(
        verification([
          check(),
          check({
            anchorId: 'anchor_main',
            path: 'src/main.ts',
            status: 'mismatch',
            liveHash: 'sha256:bbb',
            detail: 'the live source hash sha256:bbb does not match sha256:aaa',
          }),
        ]),
      );
      expect.unreachable('a stale anchor must block approval');
    } catch (error) {
      const guard = error as ReviewGuardError;
      expect(guard.code).toBe('anchor_verification_failed');
      expect(guard.details).toEqual([
        'anchor_main (mismatch: the live source hash sha256:bbb does not match sha256:aaa)',
      ]);
    }
  });

  it('accepts any local actor and only the bound reviewer for a named review', () => {
    expect(() => assertReviewer('local', 'someone')).not.toThrow();
    expect(() => assertReviewer('ada', undefined)).not.toThrow();
    expect(() => assertReviewer('ada', 'ada')).not.toThrow();
    try {
      assertReviewer('ada', 'bob');
      expect.unreachable('a different reviewer must not act on a bound review');
    } catch (error) {
      expect((error as ReviewGuardError).code).toBe('reviewer_mismatch');
    }

    expect(resolveActor('local', undefined)).toBe('local');
    expect(resolveActor('local', 'bob')).toBe('bob');
  });
});
