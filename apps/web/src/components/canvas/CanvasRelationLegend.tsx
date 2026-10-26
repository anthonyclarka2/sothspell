import { useLocale } from '../../i18n/locale.js';

/**
 * The legend is the text equivalent of the edge grammar. It names each kind
 * and states that confidence comes from static syntax and import analysis, so
 * a viewer never reads a relation as a runtime trace.
 */
export function CanvasRelationLegend() {
  const { t } = useLocale();

  return (
    <aside
      className="canvas-relation-legend"
      aria-label={t('canvas.relationLegend')}
      data-testid="canvas-relation-legend"
    >
      <h2>{t('canvas.relationLegend')}</h2>
      <ul>
        <li>
          <span className="canvas-legend-line" data-kind="evidence" aria-hidden="true" />
          {t('canvas.legendEvidence')}
        </li>
        <li>
          <span className="canvas-legend-line" data-kind="calls" aria-hidden="true" />
          {t('canvas.legendCalls')}
        </li>
        <li>
          <span
            className="canvas-legend-line"
            data-kind="references"
            aria-hidden="true"
          />
          {t('canvas.legendReferences')}
        </li>
        <li>
          <span className="canvas-legend-line" data-kind="imports" aria-hidden="true" />
          {t('canvas.legendImports')}
        </li>
      </ul>
      <p>{t('canvas.legendConfidence')}</p>
    </aside>
  );
}
