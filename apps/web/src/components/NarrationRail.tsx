import { splitSentences } from '@sothspell/narration/sentences';
import type { CompiledBeat, CompiledChapter } from '@sothspell/core';
import type { NarrationProviderChoice, NarrationStatus } from '../lib/use-narration.js';

export interface NarrationRailProps {
  chapter: CompiledChapter;
  beat: CompiledBeat;
  mode: 'read' | 'listen';
  provider: NarrationProviderChoice;
  narrationStatus: NarrationStatus;
  activeSentenceIndex: number;
  narrationError: string | null;
  onToggleMode: () => void;
  onProviderChange: (provider: NarrationProviderChoice) => void;
  onAsk: () => void;
}

export function NarrationRail({
  chapter,
  beat,
  mode,
  provider,
  narrationStatus,
  activeSentenceIndex,
  narrationError,
  onToggleMode,
  onProviderChange,
  onAsk,
}: NarrationRailProps) {
  const sentences = splitSentences(beat.narration);

  return (
    <section className="narration" aria-label="Narration">
      <div className="narration-main">
        <div className="narration-toolbar">
          <h2>{beat.title}</h2>
          <div className="narration-mode">
            <button type="button" className="secondary-action" onClick={onToggleMode}>
              {mode === 'listen' ? 'Read mode' : 'Listen'}
            </button>
            <select
              aria-label="Narration voice"
              value={provider}
              onChange={(event) =>
                onProviderChange(event.target.value as NarrationProviderChoice)
              }
            >
              <option value="browser">Browser voice</option>
              <option value="cloud">Cloud voice</option>
            </select>
          </div>
        </div>

        <p className="narration-copy">
          {sentences.map((sentence, index) => (
            <span
              key={`${sentence.charStart}-${index}`}
              className={
                index === activeSentenceIndex
                  ? 'narration-sentence is-active'
                  : 'narration-sentence'
              }
              data-sentence-index={index}
            >
              {sentence.text}{' '}
            </span>
          ))}
        </p>

        {mode === 'listen' ? (
          <p className="narration-status" role="status">
            {narrationStatus === 'playing'
              ? `Listening · ${provider === 'cloud' ? 'cloud voice' : 'browser voice'}`
              : narrationStatus === 'paused'
                ? 'Narration paused'
                : narrationStatus === 'loading'
                  ? 'Preparing narration…'
                  : narrationStatus === 'error'
                    ? 'Narration unavailable'
                    : 'Listen mode'}
          </p>
        ) : null}

        {narrationError ? <p className="notice">{narrationError}</p> : null}
      </div>
      <aside className="narration-aside">
        <h3>Ask yourself</h3>
        {beat.suggestedQuestions.length > 0 ? (
          <ul className="question-list">
            {beat.suggestedQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        ) : (
          <p className="notice">No suggested questions for this beat.</p>
        )}
        <button type="button" className="secondary-action ask-open" onClick={onAsk}>
          Ask about this beat
        </button>
        <p className="anchor-meta">
          Chapter: {chapter.title}
          <br />
          Evidence: {beat.anchors.length} anchor{beat.anchors.length === 1 ? '' : 's'}
        </p>
      </aside>
    </section>
  );
}
