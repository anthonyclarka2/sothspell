import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import type { CompiledBeat, CompiledChapter } from '@sothspell/core';
import {
  ReviewApiError,
  addReviewComment,
  decideReview,
  fetchReview,
  latestRegeneration,
  regenerateReviewBeat,
  revertReviewRegeneration,
  startReview,
  updateReviewBeat,
  type BeatEditPatch,
  type ReviewDetail,
  type ReviewIssue,
} from '../lib/review-api.js';
import { ReviewOutline } from '../components/review/ReviewOutline.js';
import { BeatReader } from '../components/review/BeatReader.js';
import { BeatEditor } from '../components/review/BeatEditor.js';
import { ReviewPanel } from '../components/review/ReviewPanel.js';

interface LocatedBeat {
  chapter: CompiledChapter;
  beat: CompiledBeat;
}

function locatedBeats(detail: ReviewDetail): LocatedBeat[] {
  return detail.tour.chapters.flatMap((chapter) =>
    chapter.beats.map((beat) => ({ chapter, beat })),
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ReviewApiError) {
    const details = error.details.length > 0 ? ` (${error.details.join('; ')})` : '';
    return `${error.message}${details}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * The `/review/:tourId` route. It starts (or resumes) the one review session
 * for the tour revision, then presents three columns: the outline, the beat
 * reader with its editor, and the decision panel. Keyboard shortcuts cover the
 * whole flow; every outcome is announced through a live region.
 */
export function ReviewPage() {
  const params = useParams({ strict: false }) as { tourId: string };
  const tourId = params.tourId;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [currentBeatId, setCurrentBeatId] = useState<string | null>(null);
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [editIssues, setEditIssues] = useState<ReviewIssue[]>([]);
  const [announcement, setAnnouncement] = useState('');

  const commentRef = useRef<HTMLTextAreaElement>(null);
  const rejectRef = useRef<HTMLTextAreaElement>(null);
  const pendingReaderFocus = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const session = await startReview(tourId);
      const next = await fetchReview(session.id);
      setSessionId(session.id);
      setDetail(next);
      setCurrentBeatId(
        (current) => current ?? next.tour.chapters[0]?.beats[0]?.id ?? null,
      );
      setError(null);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async (id: string) => {
    const next = await fetchReview(id);
    setDetail(next);
    return next;
  }, []);

  const beats = useMemo(() => (detail ? locatedBeats(detail) : []), [detail]);
  const currentIndex = beats.findIndex((entry) => entry.beat.id === currentBeatId);
  const current = currentIndex >= 0 ? beats[currentIndex]! : (beats[0] ?? null);
  const regeneration =
    detail && current ? latestRegeneration(detail.review, current.beat.id) : null;

  const verifiedAnchors = detail
    ? detail.anchors.filter((check) => check.status === 'verified').length
    : 0;
  const statusSummary = detail
    ? `Review ${detail.review.state === 'in_review' ? 'in review' : detail.review.state} · ${verifiedAnchors}/${detail.anchors.length} anchors verified`
    : '';

  function goToBeat(beatId: string): void {
    setCurrentBeatId(beatId);
    setMode('read');
    setEditIssues([]);
  }

  function step(delta: number): void {
    if (beats.length === 0) {
      return;
    }
    const next = (currentIndex + delta + beats.length) % beats.length;
    const target = beats[next];
    if (target) {
      goToBeat(target.beat.id);
    }
  }

  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    if (!sessionId) {
      return false;
    }
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh(sessionId);
      setAnnouncement(success);
      return true;
    } catch (actionError) {
      setError(errorMessage(actionError));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const saveBeat = (patch: BeatEditPatch): void => {
    if (!sessionId || !current) {
      return;
    }
    void run(
      async () => {
        try {
          await updateReviewBeat(sessionId, current.beat.id, patch);
          setEditIssues([]);
          setMode('read');
        } catch (saveError) {
          if (saveError instanceof ReviewApiError && saveError.issues.length > 0) {
            setEditIssues(saveError.issues);
          }
          throw saveError;
        }
      },
      `Beat "${patch.title ?? current.beat.title}" saved.`,
    );
  };

  const addComment = async (input: {
    beatId: string | null;
    body: string;
  }): Promise<boolean> => {
    if (!sessionId) {
      return false;
    }
    const saved = await run(
      () => addReviewComment(sessionId, input),
      'Comment added to the review.',
    );
    return saved;
  };

  const regenerate = (): void => {
    if (!sessionId || !current) {
      return;
    }
    void run(
      () => regenerateReviewBeat(sessionId, current.beat.id),
      `Beat "${current.beat.title}" regenerated; compare the diff before you keep it.`,
    );
  };

  const revert = (regenerationId: string): void => {
    if (!sessionId) {
      return;
    }
    void run(
      () => revertReviewRegeneration(sessionId, regenerationId),
      'Regeneration reverted to the previous narration.',
    );
  };

  const approve = (): void => {
    if (!sessionId || !detail) {
      return;
    }
    if (detail.review.state !== 'in_review') {
      setAnnouncement('Only a review in progress can be approved.');
      return;
    }
    void run(() => decideReview(sessionId, { decision: 'approve' }), 'Review approved.');
  };

  const reject = async (reason: string): Promise<boolean> => {
    if (!sessionId) {
      return false;
    }
    return run(
      () => decideReview(sessionId, { decision: 'reject', reason }),
      'Review rejected.',
    );
  };

  useEffect(() => {
    if (mode !== 'edit') {
      return;
    }
    document.getElementById('review-edit-title')?.focus();
  }, [mode, currentBeatId]);

  // The reader is not mounted while the editor is open, so a focus request
  // made on leaving edit mode has to wait for the next render.
  useEffect(() => {
    if (mode === 'read' && pendingReaderFocus.current) {
      pendingReaderFocus.current = false;
      document.getElementById('review-beat-heading')?.focus();
    }
  }, [mode]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === 'Escape') {
        if (mode === 'edit') {
          pendingReaderFocus.current = true;
          setMode('read');
        } else {
          document.getElementById('review-beat-heading')?.focus();
        }
        event.preventDefault();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      switch (event.key) {
        case 'n':
          step(1);
          setAnnouncement('Next beat.');
          break;
        case 'p':
          step(-1);
          setAnnouncement('Previous beat.');
          break;
        case 'c':
          commentRef.current?.focus();
          setAnnouncement('Comment field focused.');
          break;
        case 'e':
          setMode('edit');
          break;
        case 'a':
          approve();
          break;
        case 'r':
          rejectRef.current?.focus();
          setAnnouncement('Rejection needs a reason; type it in the reason field.');
          break;
        default:
          return;
      }
      event.preventDefault();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (loading && !detail) {
    return (
      <div className="page review-page">
        <p className="notice">Loading review…</p>
      </div>
    );
  }

  if (!detail || !current) {
    return (
      <div className="page review-page">
        <h1>Review</h1>
        <div className="notice" role="alert">
          <strong>The review did not load.</strong> {error ?? 'unknown error'}
        </div>
        <p>
          <Link to="/">Back to the home page</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page review-page">
      <header className="review-header">
        <p className="review-eyebrow">Human review</p>
        <h1>{detail.tour.title}</h1>
        <p className="review-subtitle">{detail.tour.subtitle}</p>
        <p className="review-announcer" role="status" aria-live="polite">
          {announcement || statusSummary}
        </p>
        <p className="field-hint">
          Shortcuts: n next · p previous · c comment · e edit · a approve · r reject ·
          Escape leaves the editor
        </p>
      </header>

      {error && (
        <div className="notice review-error" role="alert">
          <strong>The last action did not complete.</strong> {error}
        </div>
      )}

      <div className="review-layout">
        <ReviewOutline
          tour={detail.tour}
          currentBeatId={current.beat.id}
          comments={detail.review.comments}
          edits={detail.review.edits}
          regenerations={detail.review.regenerations}
          onSelect={goToBeat}
        />

        <section className="review-reader-column" aria-label="Beat reader">
          <div className="review-toolbar">
            <button
              type="button"
              className="secondary-action"
              aria-label="Previous beat"
              disabled={beats.length < 2}
              onClick={() => step(-1)}
            >
              Previous beat
            </button>
            <button
              type="button"
              className="secondary-action"
              aria-label="Next beat"
              disabled={beats.length < 2}
              onClick={() => step(1)}
            >
              Next beat
            </button>
            <button
              type="button"
              className="secondary-action"
              aria-label={mode === 'edit' ? 'Stop editing' : 'Edit beat'}
              onClick={() => {
                if (mode === 'edit') {
                  setMode('read');
                } else {
                  setEditIssues([]);
                  setMode('edit');
                }
              }}
            >
              {mode === 'edit' ? 'Stop editing' : 'Edit beat'}
            </button>
            <button
              type="button"
              className="secondary-action"
              disabled={busy}
              onClick={regenerate}
            >
              Regenerate beat
            </button>
          </div>

          {mode === 'edit' ? (
            <BeatEditor
              key={current.beat.id}
              beat={current.beat}
              chapter={current.chapter}
              busy={busy}
              serverIssues={editIssues}
              onSave={saveBeat}
              onCancel={() => {
                pendingReaderFocus.current = true;
                setMode('read');
                setEditIssues([]);
              }}
            />
          ) : (
            <BeatReader
              chapter={current.chapter}
              beat={current.beat}
              selectedAnchorId={selectedAnchorId}
              onSelectAnchor={setSelectedAnchorId}
              regeneration={regeneration}
              busy={busy}
              onRevert={revert}
            />
          )}
        </section>

        <ReviewPanel
          session={detail.review}
          tour={detail.tour}
          quality={detail.quality}
          anchors={detail.anchors}
          currentBeatId={current.beat.id}
          busy={busy}
          onComment={addComment}
          onApprove={approve}
          onReject={reject}
          commentRef={commentRef}
          rejectRef={rejectRef}
        />
      </div>
    </div>
  );
}
