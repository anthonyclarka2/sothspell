import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { createPlayback, type PlaybackSnapshot } from '@sothspell/player';
import type { CompiledBeat, CompiledTour } from '@sothspell/core';
import { fetchTour } from '../lib/api.js';
import { useAsync } from '../lib/use-async.js';
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
import { CodePane } from '../components/CodePane.js';
import { DiagramStage } from '../components/DiagramStage.js';
import { NarrationRail } from '../components/NarrationRail.js';
import { Transport } from '../components/Transport.js';

interface PlayerParams {
  tourId: string;
  beatId: string;
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
  const navigate = useNavigate();
  const clientId = useMemo(() => getOrCreateClientId(), []);
  const tourState = useAsync(() => fetchTour(params.tourId), [params.tourId]);

  const playback = useMemo(
    () => (tourState.data ? createPlayback(toPlaybackTour(tourState.data)) : null),
    [tourState.data],
  );

  const [snapshot, setSnapshot] = useState<PlaybackSnapshot | null>(null);
  const [resume, setResume] = useState<StoredRun | null>(null);
  const [hasResumed, setHasResumed] = useState(false);
  const [completedBeatIds, setCompletedBeatIds] = useState<string[]>([]);
  const [theater, setTheater] = useState(false);

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
          replace: true,
        });
      }
    }
  }, [navigate, params.beatId, params.tourId, playback]);

  useEffect(() => {
    if (!snapshot?.beatId) {
      return;
    }
    if (snapshot.beatId !== params.beatId) {
      void navigate({
        to: '/t/$tourId/$beatId',
        params: { tourId: params.tourId, beatId: snapshot.beatId },
        replace: true,
      });
    }
  }, [navigate, params.beatId, params.tourId, snapshot?.beatId]);

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
      mode: 'read',
      speed: snapshot.speed,
      updatedAt: Date.now(),
    };
    void saveRun(run);
    void saveServerRun(run);
  }, [
    clientId,
    completedBeatIds,
    hasResumed,
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
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
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

  if (tourState.status === 'loading') {
    return (
      <div className="page">
        <p className="notice">Loading the tour…</p>
      </div>
    );
  }

  if (tourState.status === 'error' || !tourState.data || !snapshot) {
    return (
      <div className="page">
        <div className="notice">
          <strong>The tour did not load.</strong> {tourState.error?.message}
        </div>
      </div>
    );
  }

  const tour = tourState.data;
  const chapter =
    tour.chapters.find((candidate) => candidate.id === snapshot.chapterId) ??
    tour.chapters[0];
  const beat = chapter?.beats.find((candidate) => candidate.id === snapshot.beatId);

  if (!chapter || !beat) {
    return (
      <div className="page">
        <div className="notice">The requested beat is not part of this tour.</div>
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
      search: { anchor: anchorId, beat: beat.id },
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

  return (
    <div className={`player-page${theater ? ' player-page--theater' : ''}`}>
      {resume && !hasResumed ? (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="notice resume-banner">
            <span>
              You have progress in this tour:{' '}
              {findBeat(tour, resume.beatId)?.title ?? resume.beatId}.{' '}
              {resume.completedBeatIds.length > 0
                ? `${resume.completedBeatIds.length} beats completed.`
                : ''}
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="primary-action" onClick={resumeRun}>
                Resume
              </button>
              <button type="button" className="secondary-action" onClick={startOver}>
                Start over
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
          <div className="stage">
            <section className="diagram-panel" aria-label="Diagram">
              <div className="panel-header">
                <strong>{chapter.diagrams[0]?.title ?? 'Diagram'}</strong>
                <span>{chapter.title}</span>
              </div>
              <DiagramStage chapter={chapter} beat={beat} onOpenAnchor={openAnchor} />
            </section>

            <section className="code-panel" aria-label="Code evidence">
              <div className="panel-header">
                <strong>{beat.anchors[0]?.label ?? 'Code evidence'}</strong>
                <span className="mono">{beat.anchors[0]?.language ?? 'text'}</span>
              </div>
              <CodePane projectSlug={tour.project.slug} beat={beat} />
            </section>
          </div>

          <NarrationRail chapter={chapter} beat={beat} />
        </div>
      </div>

      <Transport
        snapshot={snapshot}
        theater={theater}
        onToggle={() => playback?.toggle()}
        onNext={() => playback?.next()}
        onPrevious={() => playback?.previous()}
        onSeek={seek}
        onSpeed={(speed) => playback?.setSpeed(speed)}
        onToggleTheater={() => setTheater((current) => !current)}
      />
    </div>
  );
}
