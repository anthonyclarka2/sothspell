import { splitSentences } from '@sothspell/narration/sentences';
import type { CompiledBeat, CompiledChapter } from '@sothspell/core';
import type { NarrationProviderChoice, NarrationStatus } from '../lib/use-narration.js';
import { useLocale } from '../i18n/locale.js';

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
  const { locale, t } = useLocale();
  const sentences = splitSentences(beat.narration);

  const statusText =
    narrationStatus === 'playing'
      ? t(provider === 'cloud' ? 'narration.playingCloud' : 'narration.playingBrowser')
      : narrationStatus === 'paused'
        ? t('narration.paused')
        : narrationStatus === 'loading'
          ? t('narration.preparing')
          : narrationStatus === 'error'
            ? t('narration.unavailable')
            : t('narration.listenMode');

  return (
    <section className="narration" aria-label={t('narration.label')}>
      <div className="narration-main">
        <div className="narration-toolbar">
          <h2>{beat.title}</h2>
          <div className="narration-mode">
            <button type="button" className="secondary-action" onClick={onToggleMode}>
              {mode === 'listen' ? t('narration.readMode') : t('narration.listen')}
            </button>
            <select
              aria-label={t('narration.voice')}
              value={provider}
              onChange={(event) =>
                onProviderChange(event.target.value as NarrationProviderChoice)
              }
            >
              <option value="browser">{t('narration.browserVoice')}</option>
              <option value="cloud">{t('narration.cloudVoice')}</option>
            </select>
          </div>
        </div>

        {/* The narration language is the tour locale; the markup says so. */}
        <p className="narration-copy" lang={locale}>
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
            {statusText}
          </p>
        ) : null}

        {narrationError ? <p className="notice">{narrationError}</p> : null}
      </div>
      <aside className="narration-aside">
        <h3>{t('narration.askYourself')}</h3>
        {beat.suggestedQuestions.length > 0 ? (
          <ul className="question-list" lang={locale}>
            {beat.suggestedQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        ) : (
          <p className="notice">{t('narration.noQuestions')}</p>
        )}
        <button type="button" className="secondary-action ask-open" onClick={onAsk}>
          {t('narration.askAbout')}
        </button>
        <p className="anchor-meta">
          {t('narration.chapter', { title: chapter.title })}
          <br />
          {beat.anchors.length === 1
            ? t('narration.evidenceOne')
            : t('narration.evidenceMany', { count: beat.anchors.length })}
        </p>
      </aside>
    </section>
  );
}
