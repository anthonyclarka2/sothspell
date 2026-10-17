import type { CompiledTour } from '@sothspell/core';
import type { BeatEdit, BeatRegeneration, ReviewComment } from '../../lib/review-api.js';

interface ReviewOutlineProps {
  tour: CompiledTour;
  currentBeatId: string;
  comments: ReviewComment[];
  edits: BeatEdit[];
  regenerations: BeatRegeneration[];
  onSelect: (beatId: string) => void;
}

/**
 * The tour outline: chapters, beats, and the review state of each beat. It is
 * a navigation landmark of buttons rather than links because selecting a beat
 * changes the review reader, not the URL.
 */
export function ReviewOutline({
  tour,
  currentBeatId,
  comments,
  edits,
  regenerations,
  onSelect,
}: ReviewOutlineProps) {
  return (
    <nav className="review-outline" aria-label="Tour outline">
      {tour.chapters.map((chapter) => (
        <section key={chapter.id} aria-labelledby={`outline-${chapter.id}`}>
          <h3 id={`outline-${chapter.id}`}>{chapter.title}</h3>
          <ul className="review-outline-list">
            {chapter.beats.map((beat) => {
              const editCount = edits.filter((edit) => edit.beatId === beat.id).length;
              const regenerated = regenerations.some(
                (regeneration) =>
                  regeneration.beatId === beat.id && regeneration.revertedAt === null,
              );
              const commentCount = comments.filter(
                (comment) => comment.beatId === beat.id,
              ).length;
              return (
                <li key={beat.id}>
                  <button
                    type="button"
                    className="review-outline-beat"
                    aria-current={beat.id === currentBeatId ? 'true' : undefined}
                    onClick={() => onSelect(beat.id)}
                  >
                    <span className="review-outline-title">{beat.title}</span>
                    <span className="review-outline-badges">
                      {editCount > 0 && (
                        <span className="review-badge review-badge--muted">edited</span>
                      )}
                      {regenerated && (
                        <span className="review-badge review-badge--muted">
                          regenerated
                        </span>
                      )}
                      {commentCount > 0 && (
                        <span className="review-badge review-badge--muted">
                          {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
