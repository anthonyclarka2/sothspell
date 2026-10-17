import type { CompiledBeat, CompiledChapter } from '@sothspell/core';

export interface NarrationRailProps {
  chapter: CompiledChapter;
  beat: CompiledBeat;
}

export function NarrationRail({ chapter, beat }: NarrationRailProps) {
  return (
    <section className="narration" aria-label="Narration">
      <div className="narration-main">
        <h2>{beat.title}</h2>
        <p>{beat.narration}</p>
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
        <p className="anchor-meta">
          Chapter: {chapter.title}
          <br />
          Evidence: {beat.anchors.length} anchor{beat.anchors.length === 1 ? '' : 's'}
        </p>
      </aside>
    </section>
  );
}
