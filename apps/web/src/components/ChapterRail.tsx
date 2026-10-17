import { CheckCircle } from '@phosphor-icons/react';
import type { CompiledChapter } from '@sothspell/core';

export interface ChapterRailProps {
  chapters: CompiledChapter[];
  activeChapterId: string;
  activeBeatId: string;
  completedBeatIds: string[];
  onSeekBeat: (beatId: string) => void;
}

export function ChapterRail({
  chapters,
  activeChapterId,
  activeBeatId,
  completedBeatIds,
  onSeekBeat,
}: ChapterRailProps) {
  const completed = new Set(completedBeatIds);

  return (
    <aside className="chapter-rail" aria-label="Chapters and beats">
      <h2>Chapters</h2>
      <ol>
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <div className="chapter-label">{chapter.title}</div>
            <ol className="beat-rail">
              {chapter.beats.map((beat) => (
                <li key={beat.id}>
                  <button
                    type="button"
                    data-active={beat.id === activeBeatId}
                    aria-current={beat.id === activeBeatId}
                    onClick={() => onSeekBeat(beat.id)}
                  >
                    {completed.has(beat.id) ? (
                      <CheckCircle
                        size={12}
                        weight="fill"
                        className="beat-complete"
                        aria-label="completed"
                      />
                    ) : (
                      <span className="beat-dot" aria-hidden="true" />
                    )}
                    {beat.title}
                  </button>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      {chapters.length === 0 ? <p className="notice">No chapters yet.</p> : null}
      <p className="anchor-meta">Current chapter: {activeChapterId}</p>
    </aside>
  );
}
