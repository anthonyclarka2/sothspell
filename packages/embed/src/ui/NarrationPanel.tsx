import { splitSentences } from '@sothspell/narration/sentences';
import type { CompiledBeat } from '../types.js';

export interface NarrationPanelProps {
  beat: CompiledBeat;
  listening: boolean;
  activeSentenceIndex: number;
  status: string;
  error: string | null;
}

export function NarrationPanel({
  beat,
  listening,
  activeSentenceIndex,
  status,
  error,
}: NarrationPanelProps) {
  const sentences = splitSentences(beat.narration);

  return (
    <section className="narration" aria-label="Narration">
      <p className="narration-text">
        {sentences.map((sentence, index) => (
          <span
            key={`${beat.id}-${index}`}
            className="sentence"
            data-active={listening && index === activeSentenceIndex ? 'true' : undefined}
          >
            {sentence.text}
            {index < sentences.length - 1 ? ' ' : ''}
          </span>
        ))}
      </p>
      {listening && status === 'error' && error ? (
        <p className="narration-status" role="status">
          {error}
        </p>
      ) : null}
    </section>
  );
}
