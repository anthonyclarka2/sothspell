import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useLocale } from '../../i18n/locale.js';
import type { CanvasRelationStatusNode } from './canvas-flow.js';

/**
 * Relation states live in their own card so an unavailable or empty answer is
 * visible beside the container that asked, without replacing its code.
 */
export const CanvasRelationStatusCard = memo(function CanvasRelationStatusCard({
  data,
}: NodeProps<CanvasRelationStatusNode>) {
  const { t } = useLocale();
  const { status } = data;
  const direction =
    status.direction === 'incoming'
      ? t('canvas.incomingCalls')
      : status.direction === 'outgoing'
        ? t('canvas.outgoingCalls')
        : t('canvas.definition');

  const heading =
    status.state === 'empty'
      ? status.direction === 'incoming'
        ? t('canvas.noIncomingCalls')
        : t('canvas.noOutgoingCalls')
      : status.direction === 'definition'
        ? t('canvas.definitionStatus')
        : direction;

  return (
    <article
      className="canvas-card canvas-relation-status"
      data-testid="canvas-relation-status"
      data-state={status.state}
      data-direction={status.direction}
      aria-live="polite"
    >
      <header>
        <span className="canvas-card-kicker">{t('canvas.relations')}</span>
        <h3>{heading}</h3>
      </header>
      <div className="canvas-relation-status-body">
        {status.state === 'loading' ? (
          <>
            <span className="visually-hidden">
              {status.direction === 'definition'
                ? t('canvas.definitionLoading')
                : t('canvas.relationLoading', { direction })}
            </span>
            <span className="canvas-relation-skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </>
        ) : null}
        {status.state === 'unavailable' ? (
          <p>
            {t('canvas.relationUnavailable', {
              reason: status.message ?? t('canvas.relationNoReason'),
            })}
          </p>
        ) : null}
        {status.state === 'error' ? (
          <>
            <p>{t('canvas.relationError')}</p>
            <button
              type="button"
              className="canvas-text-action nodrag"
              onClick={() => data.onRetry(status)}
            >
              {t('canvas.relationRetry')}
            </button>
          </>
        ) : null}
        {status.state === 'empty' ? <p>{t('canvas.relationEmptyHint')}</p> : null}
      </div>
    </article>
  );
});
