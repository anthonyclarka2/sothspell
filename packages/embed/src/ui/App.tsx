import { useEffect, useState, type KeyboardEvent } from 'react';
import type { EmbedController } from '../controller.js';
import type { EmbedSnapshot, EmbedTour } from '../types.js';
import { ChapterRail } from './ChapterRail.js';
import { CodeExcerpt } from './CodeExcerpt.js';
import { DiagramView } from './Diagram.js';
import { NarrationPanel } from './NarrationPanel.js';
import { Transport } from './Transport.js';
import { useNarration } from './useNarration.js';

export interface AppProps {
  controller: EmbedController;
  progressEnabled: boolean;
}

function revisionLabel(tour: EmbedTour): string {
  const revision = tour.project.revision;
  return `${revision.commit}${revision.dirty ? ' (dirty)' : ''}`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName ?? '';
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}

export function App({ controller, progressEnabled }: AppProps) {
  const [snapshot, setSnapshot] = useState<EmbedSnapshot>(() => controller.getSnapshot());
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    const unsubscribe = controller.subscribe((event) => {
      setSnapshot(event.snapshot ?? controller.getSnapshot());
    });
    return unsubscribe;
  }, [controller]);

  useEffect(() => {
    setSelectedAnchorId(null);
  }, [snapshot.beatId]);

  const tour = controller.getTour();
  const chapter =
    tour && snapshot.chapterId
      ? (tour.chapters.find((candidate) => candidate.id === snapshot.chapterId) ?? null)
      : null;
  const beat =
    chapter && snapshot.beatId
      ? (chapter.beats.find((candidate) => candidate.id === snapshot.beatId) ?? null)
      : null;

  const narration = useNarration({
    beat,
    enabled: listening && beat !== null,
    speed: snapshot.speed,
    onBeatEnd: () => controller.next(),
  });

  if (!tour || !snapshot.ready || !chapter || !beat) {
    return (
      <div className="embed" part="player">
        <div className="panel-empty" role="status">
          {snapshot.ready ? 'This beat is not part of the tour.' : 'Loading the tour…'}
        </div>
      </div>
    );
  }

  const anchor =
    beat.anchors.find((candidate) => candidate.id === selectedAnchorId) ??
    beat.anchors[0] ??
    null;
  const diagram =
    chapter.diagrams.find((candidate) => candidate.id === beat.stage.diagramId) ?? null;
  const translationLocales = Object.keys(tour.translations ?? {});
  const requestedLocale = controller.getRequestedLocale();

  const stopListening = (): void => {
    if (listening) {
      setListening(false);
    }
  };

  const onToggle = (): void => {
    if (listening) {
      setListening(false);
      controller.play();
      return;
    }
    controller.toggle();
  };

  const onToggleListen = (): void => {
    if (listening) {
      setListening(false);
      return;
    }
    controller.pause();
    setListening(true);
  };

  const onSeek = (fraction: number): void => {
    stopListening();
    controller.seek(fraction);
  };

  const onNext = (): void => {
    stopListening();
    controller.next();
  };

  const onPrevious = (): void => {
    stopListening();
    controller.previous();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (isEditableTarget(event.target)) {
      return;
    }
    switch (event.key) {
      case ' ':
        event.preventDefault();
        onToggle();
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (event.shiftKey) {
          controller.seek(
            Math.min(1, snapshot.progress + 5000 / snapshot.totalDurationMs),
          );
        } else {
          onNext();
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (event.shiftKey) {
          controller.seek(
            Math.max(0, snapshot.progress - 5000 / snapshot.totalDurationMs),
          );
        } else {
          onPrevious();
        }
        break;
      default:
        break;
    }
  };

  return (
    <div
      className="embed"
      part="player"
      data-status={snapshot.status}
      onKeyDown={onKeyDown}
    >
      <header className="embed-header">
        <span className="embed-header-title" title={tour.title}>
          {tour.title}
        </span>
        <span className="embed-header-chapter">
          {chapter.title} · Beat {snapshot.beatIndex + 1}/{snapshot.beatCount}
        </span>
        <span className="embed-header-spacer" />
        {translationLocales.length > 0 ? (
          <label className="embed-locale">
            <span className="visually-hidden">Language</span>
            <select
              value={requestedLocale ?? ''}
              onChange={(event) =>
                controller.setLocale(
                  event.target.value === '' ? null : event.target.value,
                )
              }
            >
              <option value="">{tour.locale ?? 'Default'}</option>
              {translationLocales.map((locale) => (
                <option key={locale} value={locale}>
                  {locale}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      <div className="embed-body">
        <ChapterRail
          tour={tour}
          activeBeatId={snapshot.beatId}
          completedBeatIds={snapshot.completedBeatIds}
          onSeekBeat={(beatId) => {
            stopListening();
            controller.seekToBeat(beatId);
          }}
        />

        <div className="embed-stage">
          <div className="embed-panels">
            <section className="embed-panel" aria-label="Diagram">
              <div className="panel-head">
                <strong>{diagram?.title ?? 'Diagram'}</strong>
                <span>{chapter.title}</span>
              </div>
              <DiagramView
                diagram={diagram}
                focusedNodeIds={beat.stage.nodeIds}
                focusedEdgeIds={beat.stage.edgeIds}
                onOpenAnchor={setSelectedAnchorId}
              />
            </section>

            <section className="embed-panel" aria-label="Code evidence">
              <div className="panel-head">
                <strong>{anchor?.label ?? 'Code evidence'}</strong>
                <span className="mono">{anchor?.language ?? 'text'}</span>
              </div>
              <CodeExcerpt anchor={anchor} />
            </section>
          </div>

          <NarrationPanel
            beat={beat}
            listening={listening}
            activeSentenceIndex={narration.activeSentenceIndex}
            status={narration.status}
            error={narration.error}
          />
        </div>
      </div>

      <Transport
        snapshot={snapshot}
        listening={listening}
        onToggle={onToggle}
        onPrevious={onPrevious}
        onNext={onNext}
        onSeek={onSeek}
        onSpeed={(speed) => controller.setSpeed(speed)}
        onToggleListen={onToggleListen}
      />

      <footer className="embed-footer">
        <span>
          {tour.project.name} · revision{' '}
          <span className="mono">{revisionLabel(tour)}</span>
        </span>
        <span>
          {progressEnabled ? 'Progress stays in this browser' : 'Progress is off'}
        </span>
      </footer>
    </div>
  );
}
