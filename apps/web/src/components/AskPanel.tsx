import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { PaperPlaneTilt, X } from '@phosphor-icons/react';
import { askQuestion, type AskResponse } from '../lib/api.js';
import { useLocale } from '../i18n/locale.js';

export interface AskPanelProps {
  tourId: string;
  beatId: string;
  projectSlug: string;
  onClose: () => void;
  onContinue: () => void;
}

export function AskPanel({
  tourId,
  beatId,
  projectSlug,
  onClose,
  onContinue,
}: AskPanelProps) {
  const { t } = useLocale();
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ question: string; answer: string }>>([]);

  const submit = async () => {
    const trimmed = question.trim();
    if (trimmed.length < 3 || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await askQuestion({
        tourId,
        beatId,
        question: trimmed,
        history,
      });
      setAnswer(response);
      setHistory((current) => [
        ...current,
        { question: trimmed, answer: response.answer.markdown },
      ]);
      setQuestion('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('ask.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="ask-panel" aria-label={t('ask.label')}>
      <div className="ask-header">
        <div>
          <h2>{t('ask.title')}</h2>
          <p>{t('ask.intro')}</p>
        </div>
        <button
          type="button"
          className="secondary-action"
          onClick={onClose}
          aria-label={t('ask.close')}
        >
          <X size={16} weight="bold" />
        </button>
      </div>

      <label className="ask-field">
        <span>{t('ask.question')}</span>
        <textarea
          value={question}
          rows={3}
          placeholder={t('ask.placeholder')}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submit();
            }
          }}
        />
      </label>

      <div className="ask-actions">
        <button
          type="button"
          className="primary-action"
          onClick={() => void submit()}
          disabled={submitting || question.trim().length < 3}
        >
          <PaperPlaneTilt size={15} weight="fill" />
          {submitting ? t('ask.submitting') : t('ask.submit')}
        </button>
        {answer ? (
          <button type="button" className="secondary-action" onClick={onContinue}>
            {t('ask.continue')}
          </button>
        ) : null}
      </div>

      {error ? <p className="notice">{error}</p> : null}

      {answer ? (
        <div className="ask-answer" role="status">
          {answer.answer.markdown.split('\n\n').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {answer.citations.length > 0 ? (
            <div className="ask-citations">
              <h3>{t('ask.evidence')}</h3>
              <ul>
                {answer.citations.map((citation) => (
                  <li key={citation.id}>
                    <Link
                      to="/p/$projectId/source/$"
                      params={{ projectId: projectSlug, _splat: citation.path }}
                      search={{ anchor: citation.id, beat: beatId }}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {citation.label}
                    </Link>
                    <span className="mono">
                      {citation.path}:{citation.startLine}–{citation.endLine}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {answer.answer.followUps.length > 0 ? (
            <div className="ask-followups">
              <h3>{t('ask.next')}</h3>
              {answer.answer.followUps.map((followUp) => (
                <button
                  key={followUp}
                  type="button"
                  className="secondary-action"
                  onClick={() => setQuestion(followUp)}
                >
                  {followUp}
                </button>
              ))}
            </div>
          ) : null}
          {answer.warnings.length > 0 ? (
            <p className="anchor-meta">{answer.warnings.join(' ')}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
