import { useEffect, useId, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { CompiledBeat } from '@sothspell/core';
import { useLocale } from '../i18n/locale.js';
import type { PlayerView } from '../lib/player-view.js';
import './learning-check.css';

interface LearningCheckDialogProps {
  beat: CompiledBeat & { learningCheck: NonNullable<CompiledBeat['learningCheck']> };
  projectSlug: string;
  tourId: string;
  view: PlayerView;
  onContinue: () => void;
}

export function LearningCheckDialog({
  beat,
  projectSlug,
  tourId,
  view,
  onContinue,
}: LearningCheckDialogProps) {
  const { t } = useLocale();
  const [revealed, setRevealed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const explanationRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const check = beat.learningCheck;
  const anchors = beat.anchors.filter((anchor) => check.anchorIds.includes(anchor.id));

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    titleRef.current?.focus();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    if (revealed) {
      explanationRef.current?.focus();
    }
  }, [revealed]);

  return (
    <dialog
      ref={dialogRef}
      className="learning-check"
      aria-labelledby={id + '-title'}
      aria-describedby={id + '-prompt'}
      onCancel={(event) => {
        event.preventDefault();
        onContinue();
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <h2 id={id + '-title'} ref={titleRef} tabIndex={-1}>
        {t('check.title')}
      </h2>
      <section aria-labelledby={id + '-prompt'}>
        <h3 id={id + '-prompt'} lang={check.locale} dir="auto">
          {check.prompt}
        </h3>
        <label className="ask-field">
          <span>{t('check.answer')}</span>
          <textarea
            ref={answerRef}
            rows={3}
            maxLength={2000}
            autoComplete="off"
            aria-describedby={id + '-privacy'}
          />
        </label>
        <p id={id + '-privacy'} className="learning-check__privacy">
          {t('check.private')}
        </p>
      </section>

      {revealed ? (
        <section
          className="learning-check__explanation"
          aria-labelledby={id + '-explanation'}
        >
          <h3 id={id + '-explanation'} ref={explanationRef} tabIndex={-1}>
            {t('check.explanation')}
          </h3>
          <p lang={check.locale} dir="auto">
            {check.explanation}
          </p>
        </section>
      ) : null}

      <details className="learning-check__evidence">
        <summary>{t('check.hint')}</summary>
        {anchors.map((anchor) => (
          <div key={anchor.id}>
            <h4>{anchor.label ?? anchor.symbol ?? anchor.path}</h4>
            <p className="mono" dir="ltr">
              {anchor.path}:{anchor.startLine}–{anchor.endLine}
            </p>
            <pre tabIndex={0} aria-label={anchor.path} dir="ltr">
              <code>{anchor.excerpt}</code>
            </pre>
            <Link
              to="/p/$projectId/source/$"
              params={{ projectId: projectSlug, _splat: anchor.path }}
              search={{ anchor: anchor.id, beat: beat.id, tourId, view }}
              target="_blank"
              rel="noreferrer"
            >
              {t('check.fullCode')}
            </Link>
          </div>
        ))}
      </details>

      <div className="learning-check__actions">
        {revealed ? (
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              if (answerRef.current) {
                answerRef.current.value = '';
                answerRef.current.focus();
              }
              setRevealed(false);
            }}
          >
            {t('check.retry')}
          </button>
        ) : (
          <button
            type="button"
            className="primary-action"
            onClick={() => setRevealed(true)}
          >
            {t('check.reveal')}
          </button>
        )}
        <button
          type="button"
          className={revealed ? 'primary-action' : 'secondary-action'}
          onClick={onContinue}
        >
          {t(revealed ? 'check.continue' : 'check.skip')}
        </button>
      </div>
    </dialog>
  );
}
