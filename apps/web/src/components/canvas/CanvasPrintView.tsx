import type { CanvasDiagramCard, CanvasPrintModel } from '@sothspell/canvas';
import { useLocale } from '../../i18n/locale.js';
import { shikiHtmlForCanvas } from './code-html.js';

export interface CanvasPrintViewProps {
  model: CanvasPrintModel;
}

/**
 * The print tree is a document, not the spatial board with different CSS. It
 * renders the same scene in normal flow so the browser can paginate it and keep
 * every code glyph selectable. Collapsed lines are absent from the canvas DOM,
 * so the full anchor HTML from the export model is used here instead.
 */
export function CanvasPrintView({ model }: CanvasPrintViewProps) {
  const { t } = useLocale();
  const title = model.title;
  const diagram = model.sections.find((section) => section.kind === 'diagram');
  const relationSection = model.sections.find((section) => section.kind === 'relations');
  const exportedAt =
    title.exportedAt === null
      ? t('canvas.print.unknownDate')
      : title.exportedAt.slice(0, 10);

  return (
    <article
      className="canvas-print-view"
      data-testid="canvas-print-view"
      lang={title.locale}
      aria-labelledby="canvas-print-title"
    >
      <header className="canvas-print-title">
        <p className="canvas-print-kicker">{t('canvas.print.kicker')}</p>
        <h1 id="canvas-print-title">{title.beatTitle}</h1>
        <p className="canvas-print-subtitle">
          {title.chapterTitle} · {title.tourTitle}
        </p>
        <dl className="canvas-print-meta">
          <div>
            <dt>{t('canvas.print.project')}</dt>
            <dd>{title.projectName}</dd>
          </div>
          <div>
            <dt>{t('canvas.print.revision')}</dt>
            <dd className="mono">
              {title.revision}
              {title.revisionDirty ? ` · ${t('canvas.print.dirty')}` : ''}
            </dd>
          </div>
          <div>
            <dt>{t('canvas.print.exported')}</dt>
            <dd>{exportedAt}</dd>
          </div>
          <div>
            <dt>{t('canvas.print.locale')}</dt>
            <dd>{title.locale}</dd>
          </div>
        </dl>
      </header>

      {diagram?.kind === 'diagram' ? (
        <section className="canvas-print-section" aria-labelledby="canvas-print-diagram">
          <h2 id="canvas-print-diagram">{t('canvas.print.diagram')}</h2>
          <figure className="canvas-print-figure">
            <PrintDiagram diagram={diagram.diagram} />
            <figcaption>{diagram.diagram.title}</figcaption>
          </figure>
        </section>
      ) : null}

      <section className="canvas-print-section" aria-labelledby="canvas-print-code">
        <h2 id="canvas-print-code">{t('canvas.print.code')}</h2>
        {model.sections.some((section) => section.kind === 'container') ? (
          <ol className="canvas-print-list">
            {model.sections.map((section) =>
              section.kind === 'container' ? (
                <li key={section.container.id}>
                  <article
                    className="canvas-print-card"
                    data-testid="canvas-print-container"
                    data-print-container-id={section.container.id}
                    data-print-source={section.container.source}
                  >
                    <header className="canvas-print-card-header">
                      <span className="canvas-print-kicker">
                        {section.container.source === 'relation'
                          ? t('canvas.print.bounded')
                          : t('canvas.print.fullAnchor')}
                      </span>
                      <h3>{section.container.label}</h3>
                      <p className="mono">
                        {t('canvas.codeMeta', {
                          path: section.container.path,
                          start: section.container.startLine,
                          end: section.container.endLine,
                          language: section.container.language,
                        })}
                      </p>
                    </header>
                    {section.container.relations.map((relation) => (
                      <p
                        key={relation.id}
                        className="canvas-print-relation"
                        data-print-relation={relation.relation}
                      >
                        <span>
                          {relation.direction === 'incoming'
                            ? t('canvas.print.relationIncoming', {
                                label: relation.counterpartLabel,
                              })
                            : t('canvas.print.relationOutgoing', {
                                label: relation.counterpartLabel,
                              })}
                        </span>
                        <span className="canvas-print-relation-badge">
                          {t('canvas.relationBadge', {
                            relation: relation.relation,
                            confidence: t('canvas.relationStatic'),
                          })}
                        </span>
                      </p>
                    ))}
                    <div
                      className="code-excerpt canvas-print-code"
                      // The compiler's trusted Shiki HTML. This is the full
                      // anchor for tour evidence and the API's bounded excerpt
                      // for a relation container; never the collapsed DOM.
                      dangerouslySetInnerHTML={{
                        __html: shikiHtmlForCanvas(section.container.html, undefined),
                      }}
                    />
                  </article>
                </li>
              ) : null,
            )}
          </ol>
        ) : (
          <p className="canvas-print-note">{t('canvas.noCode')}</p>
        )}
        {model.hiddenContainerCount > 0 ? (
          <p className="canvas-print-note">
            {t('canvas.print.hidden', { count: model.hiddenContainerCount })}
          </p>
        ) : null}
      </section>

      {relationSection?.kind === 'relations' ? (
        <section
          className="canvas-print-section"
          aria-labelledby="canvas-print-relations"
        >
          <h2 id="canvas-print-relations">{t('canvas.print.relations')}</h2>
          <ul className="canvas-print-relations">
            {relationSection.relations.map((relation) => (
              <li key={relation.id}>
                <span>
                  {t('canvas.print.relationSummary', {
                    from: relation.fromLabel,
                    to: relation.toLabel,
                  })}
                </span>
                <span className="canvas-print-relation-badge">
                  {t('canvas.relationBadge', {
                    relation: relation.relation,
                    confidence: t('canvas.relationStatic'),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="canvas-print-footer">
        <h2>{t('canvas.relationLegend')}</h2>
        <ul className="canvas-print-legend">
          <li>{t('canvas.legendEvidence')}</li>
          <li>{t('canvas.legendCalls')}</li>
          <li>{t('canvas.legendReferences')}</li>
          <li>{t('canvas.legendImports')}</li>
        </ul>
        <p>{t('canvas.legendConfidence')}</p>
        <p>{t('canvas.print.note')}</p>
      </footer>
    </article>
  );
}

/**
 * The print diagram is one SVG so node positions scale with the page instead of
 * relying on a transform that a print engine may flatten differently.
 */
function PrintDiagram({ diagram }: { diagram: CanvasDiagramCard }) {
  const objects = new Map(diagram.objects.map((object) => [object.id, object] as const));
  const markerId = `canvas-print-arrow-${diagram.id}`;

  return (
    <svg
      className="canvas-print-diagram"
      viewBox={`0 0 ${diagram.diagram.width} ${diagram.diagram.height}`}
      role="img"
      aria-label={diagram.title}
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      </defs>
      {diagram.diagram.edges.map((edge) => {
        const from = objects.get(edge.from);
        const to = objects.get(edge.to);
        if (!from || !to) {
          return null;
        }
        const x1 = from.x + from.width;
        const y1 = from.y + from.height / 2;
        const x2 = to.x;
        const y2 = to.y + to.height / 2;
        const mid = (x1 + x2) / 2;
        return (
          <g key={edge.id}>
            <path
              className="canvas-print-wire"
              d={`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`}
              markerEnd={`url(#${markerId})`}
            />
            {edge.label === undefined ? null : (
              <text x={mid + 4} y={(y1 + y2) / 2 - 5} className="canvas-print-wire-label">
                {edge.label}
              </text>
            )}
          </g>
        );
      })}
      {diagram.objects.map((object) => (
        <g key={object.id} className="canvas-print-node">
          <rect
            x={object.x}
            y={object.y}
            width={object.width}
            height={object.height}
            rx={8}
          />
          <text x={object.x + 10} y={object.y + 23} className="canvas-print-node-label">
            {shortLabel(object.label)}
          </text>
          <text x={object.x + 10} y={object.y + 41} className="canvas-print-node-kind">
            {object.type}
          </text>
        </g>
      ))}
    </svg>
  );
}

function shortLabel(label: string): string {
  return label.length <= 26 ? label : `${label.slice(0, 25)}…`;
}
