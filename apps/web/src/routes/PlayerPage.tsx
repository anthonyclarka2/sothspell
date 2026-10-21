import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { createPlayback, type PlaybackSnapshot } from '@sothspell/player';
import type { CompiledBeat, CompiledTour } from '@sothspell/core';
import { fetchTour } from '../lib/api.js';
import { useAsync } from '../lib/use-async.js';
import { useLocale } from '../i18n/locale.js';
import {
  clearRun,
  getOrCreateClientId,
  loadRun,
  loadServerRun,
  mergeRuns,
  saveRun,
  saveServerRun,
  type StoredRun,
} from '../lib/run-store.js';
import { ChapterRail } from '../components/ChapterRail.js';
import { NarrationRail } from '../components/NarrationRail.js';
import { StageView } from '../components/StageView.js';
import { CanvasView } from '../components/canvas/index.js';
import { Transport } from '../components/Transport.js';
import { AskPanel } from '../components/AskPanel.js';
import { useNarration, type NarrationProviderChoice } from '../lib/use-narration.js';
import { useMediaQuery } from '../lib/use-media-query.js';

interface PlayerParams {
  tourId: string;
  beatId: string;
}

interface PlayerSearch {
  view: 'canvas' | undefined;
}

function toPlaybackTour(tour: CompiledTour) {
  return {
    id: tour.id,
    title: tour.title,
    chapters: tour.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      beats: chapter.beats.map((beat) => ({
        id: beat.id,
        title: beat.title,
        durationMs: beat.durationMs,
      })),
    })),
  };
}

function findBeat(tour: CompiledTour, beatId: string): CompiledBeat | null {
  for (const chapter of tour.chapters) {
    const beat = chapter.beats.find((candidate) => candidate.id === beatId);
    if (beat) {
      return beat;
    }
  }
  return null;
}

export function PlayerPage() {
  const params = useParams({ strict: false }) as PlayerParams;
  const search = useSearch({ strict: false }) as PlayerSearch;
  const navigate = useNavigate();
  const { locale, t } = useLocale();
  const clientId = useMemo(() => getOrCreateClientId(), []);
  const compact = useMediaQuery('(max-width: 767px)');
  const canvasRequested = search.view === 'canvas';
  const showCanvas = canvasRequested && !compact;
  const tourState = useAsync(
    () => fetchTour(params.tourId, locale),
    [params.tourId, locale],
  );

  // The last compiled tour stays mounted while the next locale loads, so a
  // locale switch never resets playback or loses the current beat.
  const [loadedTour, setLoadedTour] = useState<CompiledTour | null>(null);
  useEffect(() => {
    if (tourState.data) {
      setLoadedTour(tourState.data);
    }
  }, [tourState.data]);
  const tour = tourState.data ?? loadedTour;

  const playback = useMemo(
    () => (tour ? createPlayback(toPlaybackTour(tour)) : null),
    // The playback tour is structural (ids and durations); a locale change must
    // not rebuild the state machine, so only the tour id does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tour?.id],
  );

  const [snapshot, setSnapshot] = useState<PlaybackSnapshot | null>(null);
  const [resume, setResume] = useState<StoredRun | null>(null);
  const [hasResumed, setHasResumed] = useState(false);
  const [completedBeatIds, setCompletedBeatIds] = useState<string[]>([]);
  const [theater, setTheater] = useState(false);
  const [narrationMode, setNarrationMode] = useState<'read' | 'listen'>('read');
  const [narrationProvider, setNarrationProvider] =
    useState<NarrationProviderChoice>('browser');
  const [askOpen, setAskOpen] = useState(false);
  const [compactNoteDismissed, setCompactNoteDismissed] = useState(false);
  const resumeAfterAskRef = useRef(false);

  const currentChapter =
    tour && snapshot
      ? (tour.chapters.find((candidate) => candidate.id === snapshot.chapterId) ??
        tour.chapters[0] ??
        null)
      : null;
  const currentBeat =
    currentChapter?.beats.find((candidate) => candidate.id === snapshot?.beatId) ?? null;

  const narration = useNarration({
    tourId: params.tourId,
    beat: currentBeat,
    enabled: narrationMode === 'listen' && currentBeat !== null,
    provider: narrationProvider,
    speed: snapshot?.speed ?? 1,
    locale,
    onBeatEnd: () => playback?.next(),
    onProgress: (offsetMs) => playback?.seekOffset(offsetMs),
  });

  useEffect(() => {
    if (!playback) {
      return;
    }

    setSnapshot(playback.getSnapshot());
    const unsubscribe = playback.subscribe((event) => {
      if (event.type === 'beat.completed') {
        setCompletedBeatIds((current) =>
          current.includes(event.snapshot.beatId)
            ? current
            : [...current, event.snapshot.beatId],
        );
      }
      setSnapshot(event.snapshot);
    });
    const timer = window.setInterval(() => playback.tick(250), 250);

    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [playback]);

  useEffect(() => {
    if (!playback) {
      return;
    }
    const current = playback.getSnapshot();
    if (current.beatId !== params.beatId) {
      try {
        playback.seekBeat(params.beatId);
      } catch {
        void navigate({
          to: '/t/$tourId/$beatId',
          params: { tourId: params.tourId, beatId: current.beatId },
          search: { view: search.view },
          replace: true,
        });
      }
    }
  }, [navigate, params.beatId, params.tourId, playback, search.view]);

  useEffect(() => {
    if (!snapshot?.beatId) {
      return;
    }
    if (snapshot.beatId !== params.beatId) {
      void navigate({
        to: '/t/$tourId/$beatId',
        params: { tourId: params.tourId, beatId: snapshot.beatId },
        search: { view: search.view },
        replace: true,
      });
    }
  }, [navigate, params.beatId, params.tourId, search.view, snapshot?.beatId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadRun(params.tourId), loadServerRun(params.tourId)])
      .then(([local, server]) => {
        if (cancelled) {
          return;
        }
        const merged = mergeRuns(local, server);
        if (merged) {
          setResume(merged);
          setCompletedBeatIds(merged.completedBeatIds);
        } else {
          setHasResumed(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasResumed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.tourId]);

  useEffect(() => {
    if (!snapshot?.beatId || !snapshot.status || !playback || !hasResumed) {
      return;
    }
    if (snapshot.status === 'completed') {
      void clearRun(params.tourId);
      return;
    }
    const run: StoredRun = {
      clientId,
      tourId: params.tourId,
      beatId: snapshot.beatId,
      offsetMs: playback.getSnapshot().offsetMs,
      completedBeatIds,
      mode: narrationMode,
      speed: snapshot.speed,
      updatedAt: Date.now(),
    };
    void saveRun(run);
    void saveServerRun(run);
  }, [
    clientId,
    completedBeatIds,
    hasResumed,
    narrationMode,
    params.tourId,
    playback,
    snapshot?.beatId,
    snapshot?.status,
    snapshot?.speed,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      if (
        event.defaultPrevented ||
        target?.isContentEditable ||
        tag === 'INPUT' ||
        tag === 'SELECT' ||
        tag === 'TEXTAREA' ||
        tag === 'BUTTON' ||
        tag === 'A'
      ) {
        return;
      }
      switch (event.key) {
        case ' ':
          event.preventDefault();
          playback?.toggle();
          break;
        case 'ArrowRight':
          if (event.shiftKey) {
            playback?.seekOffset((playback?.getSnapshot().offsetMs ?? 0) + 5000);
          } else {
            playback?.next();
          }
          break;
        case 'ArrowLeft':
          if (event.shiftKey) {
            playback?.seekOffset(
              Math.max(0, (playback?.getSnapshot().offsetMs ?? 0) - 5000),
            );
          } else {
            playback?.previous();
          }
          break;
        case 't':
        case 'T':
          setTheater((current) => !current);
          break;
        case 'Escape':
          setTheater(false);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playback]);

  if (!tour) {
    return (
      <div className="page">
        {tourState.status === 'error' ? (
          <div className="notice">
            <strong>{t('player.loadError')}</strong> {tourState.error?.message}
          </div>
        ) : (
          <p className="notice">{t('player.loading')}</p>
        )}
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="page">
        <p className="notice">{t('player.loading')}</p>
      </div>
    );
  }

  const chapter = currentChapter;
  const beat = currentBeat;

  if (!chapter || !beat) {
    return (
      <div className="page">
        <div className="notice">{t('player.beatNotFound')}</div>
      </div>
    );
  }

  const openAnchor = (anchorId: string) => {
    const anchor = beat.anchors.find((candidate) => candidate.id === anchorId);
    if (!anchor) {
      return;
    }
    playback?.pause();
    void navigate({
      to: '/p/$projectId/source/$',
      params: { projectId: tour.project.slug, _splat: anchor.path },
      search: { anchor: anchorId, beat: beat.id, tourId: tour.id },
    });
  };

  const resumeRun = () => {
    if (!resume || !playback) {
      return;
    }
    try {
      playback.seekBeat(resume.beatId);
      playback.seekOffset(resume.offsetMs);
      playback.setSpeed(resume.speed);
      setCompletedBeatIds(resume.completedBeatIds);
      setNarrationMode(resume.mode === 'listen' ? 'listen' : 'read');
      setHasResumed(true);
    } catch {
      void clearRun(params.tourId);
      setResume(null);
      setHasResumed(true);
    }
  };

  const startOver = () => {
    void clearRun(params.tourId);
    setResume(null);
    setCompletedBeatIds([]);
    setHasResumed(true);
    const firstBeat = tour.chapters[0]?.beats[0];
    if (firstBeat) {
      playback?.seekBeat(firstBeat.id);
    }
    playback?.seekOffset(0);
  };

  const seek = (fraction: number) => {
    playback?.pause();
    playback?.seekProgress(fraction);
  };

  const selectView = (view: 'stage' | 'canvas') => {
    const nextSearch: PlayerSearch =
      view === 'canvas' ? { view: 'canvas' } : { view: undefined };
    void navigate({
      to: '/t/$tourId/$beatId',
      params: { tourId: params.tourId, beatId: beat.id },
      search: nextSearch,
      replace: true,
    });
  };

  const openAsk = () => {
    resumeAfterAskRef.current =
      narrationMode === 'listen'
        ? narration.status === 'playing'
        : snapshot.status === 'playing';
    if (narrationMode === 'listen') {
      narration.pause();
    } else {
      playback?.pause();
    }
    setAskOpen(true);
  };

  const closeAsk = (shouldResume: boolean) => {
    setAskOpen(false);
    if (shouldResume && resumeAfterAskRef.current) {
      if (narrationMode === 'listen') {
        narration.resume();
      } else {
        playback?.play();
      }
    }
    resumeAfterAskRef.current = false;
  };

  return (
    <div className={`player-page${theater ? ' player-page--theater' : ''}`}>
      {resume && !hasResumed ? (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="notice resume-banner">
            <span>
              {t('player.resume', {
                beat: findBeat(tour, resume.beatId)?.title ?? resume.beatId,
              })}{' '}
              {resume.completedBeatIds.length > 0
                ? t('player.resumeCompleted', { count: resume.completedBeatIds.length })
                : ''}
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="primary-action" onClick={resumeRun}>
                {t('player.resumeAction')}
              </button>
              <button type="button" className="secondary-action" onClick={startOver}>
                {t('player.startOver')}
              </button>
            </span>
          </div>
        </div>
      ) : null}

      <div className="player-layout">
        <ChapterRail
          chapters={tour.chapters}
          activeChapterId={chapter.id}
          activeBeatId={beat.id}
          completedBeatIds={completedBeatIds}
          onSeekBeat={(beatId) => playback?.seekBeat(beatId)}
        />

        <div className="stage-column">
          <div className="player-viewbar">
            <div
              className="player-view-switch"
              role="group"
              aria-label={t('canvas.viewLabel')}
            >
              <button
                type="button"
                aria-pressed={!canvasRequested}
                onClick={() => selectView('stage')}
              >
                {t('canvas.stage')}
              </button>
              <button
                type="button"
                aria-pressed={canvasRequested}
                onClick={() => selectView('canvas')}
              >
                {t('canvas.canvasView')}
              </button>
            </div>
            {canvasRequested && compact && !compactNoteDismissed ? (
              <div className="notice canvas-compact-note">
                <span>{t('canvas.compactNote')}</span>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setCompactNoteDismissed(true)}
                >
                  {t('canvas.dismiss')}
                </button>
              </div>
            ) : null}
          </div>

          {showCanvas ? (
            <CanvasView tour={tour} chapter={chapter} beat={beat} />
          ) : (
            <StageView
              chapter={chapter}
              beat={beat}
              projectSlug={tour.project.slug}
              tourId={tour.id}
              onOpenAnchor={openAnchor}
            />
          )}

          <NarrationRail
            chapter={chapter}
            beat={beat}
            mode={narrationMode}
            provider={narrationProvider}
            narrationStatus={narration.status}
            activeSentenceIndex={narration.activeSentenceIndex}
            narrationError={narration.error}
            onToggleMode={() => {
              if (narrationMode === 'read') {
                playback?.pause();
                setNarrationMode('listen');
              } else {
                narration.stop();
                setNarrationMode('read');
              }
            }}
            onProviderChange={setNarrationProvider}
            onAsk={openAsk}
          />
        </div>
      </div>

      {askOpen ? (
        <AskPanel
          tourId={params.tourId}
          beatId={beat.id}
          projectSlug={tour.project.slug}
          onClose={() => closeAsk(false)}
          onContinue={() => closeAsk(true)}
        />
      ) : null}

      <Transport
        snapshot={snapshot}
        theater={theater}
        playingOverride={
          narrationMode === 'listen'
            ? narration.status === 'playing'
            : snapshot.status === 'playing'
        }
        onToggle={() => {
          if (narrationMode === 'listen') {
            narration.toggle();
          } else {
            playback?.toggle();
          }
        }}
        onNext={() => playback?.next()}
        onPrevious={() => playback?.previous()}
        onSeek={seek}
        onSpeed={(speed) => playback?.setSpeed(speed)}
        onToggleTheater={() => setTheater((current) => !current)}
      />
    </div>
  );
}
