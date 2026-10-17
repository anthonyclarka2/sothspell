import { CheckCircle } from '@phosphor-icons/react';
import type { CompiledChapter } from '@sothspell/core';
import { useLocale } from '../i18n/locale.js';

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
  const { t } = useLocale();
  const completed = new Set(completedBeatIds);

  return (
    <aside className="chapter-rail" aria-label={t('rail.label')}>
      <h2>{t('rail.chapters')}</h2>
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
                        aria-label={t('rail.completed')}
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
      {chapters.length === 0 ? <p className="notice">{t('rail.empty')}</p> : null}
      <p className="anchor-meta">{t('rail.current', { id: activeChapterId })}</p>
    </aside>
  );
}
