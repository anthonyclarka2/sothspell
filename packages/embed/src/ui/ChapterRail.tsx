import type { EmbedTour } from '../types.js';

export interface ChapterRailProps {
  tour: EmbedTour;
  activeBeatId: string | null;
  completedBeatIds: string[];
  onSeekBeat: (beatId: string) => void;
}

/**
 * The rail is the embed's table of contents. It is deliberately the same
 * chapter/beat shape the web player shows so the two players stay legible as
 * one product.
 */
export function ChapterRail({
  tour,
  activeBeatId,
  completedBeatIds,
  onSeekBeat,
}: ChapterRailProps) {
  const completed = new Set(completedBeatIds);

  return (
    <nav className="embed-rail" aria-label="Chapters and beats">
      <h2>Chapters</h2>
      <ol>
        {tour.chapters.map((chapter) => (
          <li key={chapter.id}>
            <div className="rail-chapter">{chapter.title}</div>
            <ol>
              {chapter.beats.map((beat) => (
                <li key={beat.id}>
                  <button
                    type="button"
                    className="rail-beat"
                    aria-current={beat.id === activeBeatId}
                    onClick={() => onSeekBeat(beat.id)}
                  >
                    <span
                      className="rail-dot"
                      data-complete={completed.has(beat.id) ? 'true' : undefined}
                      aria-hidden="true"
                    />
                    {beat.title}
                  </button>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </nav>
  );
}
