import { useEffect } from 'react';
import type { CompiledBeat, CompiledChapter } from '@sothspell/core';
import { DiagramStage } from '../DiagramStage.js';
import { RegenerationDiff } from './RegenerationDiff.js';
import type { BeatRegeneration } from '../../lib/review-api.js';

interface BeatReaderProps {
  chapter: CompiledChapter;
  beat: CompiledBeat;
  selectedAnchorId: string | null;
  onSelectAnchor: (anchorId: string) => void;
  regeneration: BeatRegeneration | null;
  busy: boolean;
  onRevert: (regenerationId: string) => void;
}

/**
 * The beat reader: narration, the evidence the beat cites, the diagram it
 * focuses, and — when the beat was regenerated — the old-versus-new diff.
 */
export function BeatReader({
  chapter,
  beat,
  selectedAnchorId,
  onSelectAnchor,
  regeneration,
  busy,
  onRevert,
}: BeatReaderProps) {
  useEffect(() => {
    if (!selectedAnchorId) {
      return;
    }
    document
      .getElementById(`review-anchor-${selectedAnchorId}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedAnchorId]);

  return (
    <article className="review-reader" aria-labelledby="review-beat-heading">
      <p className="review-eyebrow">{chapter.title}</p>
      <h2 id="review-beat-heading" tabIndex={-1}>
        {beat.title}
      </h2>

      <div className="review-narration">
        {beat.narration.split('\n\n').map((paragraph, index) => (
          <p key={`paragraph-${index}`}>{paragraph}</p>
        ))}
      </div>

      {beat.suggestedQuestions.length > 0 && (
        <section className="review-questions" aria-labelledby="review-questions-heading">
          <h3 id="review-questions-heading">Suggested questions</h3>
          <ul>
            {beat.suggestedQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="review-anchors" aria-labelledby="review-anchors-heading">
        <h3 id="review-anchors-heading">Code anchors</h3>
        {beat.anchors.map((anchor) => (
          <section
            className="review-anchor"
            key={anchor.id}
            id={`review-anchor-${anchor.id}`}
            data-selected={anchor.id === selectedAnchorId}
          >
            <header className="review-anchor-head">
              <button
                type="button"
                className="review-anchor-select"
                aria-pressed={anchor.id === selectedAnchorId}
                onClick={() => onSelectAnchor(anchor.id)}
              >
                {anchor.label ?? anchor.symbol ?? anchor.path}
              </button>
              <span className="mono">
                {anchor.path}:{anchor.startLine}-{anchor.endLine}
              </span>
            </header>
            <div
              className="code-excerpt"
              // The compiler produced this HTML from the anchored excerpt.
              dangerouslySetInnerHTML={{ __html: anchor.html }}
            />
          </section>
        ))}
      </section>

      <section className="review-diagram" aria-labelledby="review-diagram-heading">
        <h3 id="review-diagram-heading">Diagram</h3>
        <div className="review-diagram-canvas">
          <DiagramStage chapter={chapter} beat={beat} onOpenAnchor={onSelectAnchor} />
        </div>
      </section>

      {regeneration && (
        <RegenerationDiff regeneration={regeneration} busy={busy} onRevert={onRevert} />
      )}
    </article>
  );
}
