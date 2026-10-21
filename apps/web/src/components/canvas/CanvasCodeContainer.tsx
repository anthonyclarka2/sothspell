import { memo, useMemo, type CSSProperties } from 'react';
import { Link } from '@tanstack/react-router';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useLocale } from '../../i18n/locale.js';
import { canvasCodeLineHandle, type CanvasCodeNode } from './canvas-flow.js';
import { COLLAPSED_LINES, lineCountOf, shikiHtmlForCanvas } from './code-html.js';

/**
 * Handle offsets mirror the code body in the canvas stylesheet. They are
 * presentation measurements, not layout: the package still owns the card size.
 */
const CODE_TOP_PADDING = 6;
const LINE_HEIGHT = 18;

/**
 * One code anchor as a card. The compiled Shiki HTML is rendered once; the
 * collapsed state removes hidden lines from the DOM and the Shiki tab stop is
 * overridden so the card's own controls are the only keyboard stops.
 */
export const CanvasCodeContainer = memo(function CanvasCodeContainer({
  data,
}: NodeProps<CanvasCodeNode>) {
  const { t } = useLocale();
  const { container, collapsed } = data;
  const totalLines = lineCountOf(container.excerpt);
  const visibleLines = collapsed ? Math.min(COLLAPSED_LINES, totalLines) : totalLines;
  const html = useMemo(
    () => shikiHtmlForCanvas(container.html, collapsed ? COLLAPSED_LINES : undefined),
    [collapsed, container.html],
  );
  const linkedLines = new Set(data.linkedLines);

  return (
    <article
      className="canvas-card canvas-code-container"
      data-testid="canvas-code-container"
      data-container-id={container.id}
      data-focused={data.focused}
    >
      <header className="canvas-code-header">
        <div className="canvas-code-identity">
          <h3>{container.label}</h3>
          <p className="mono">
            {t('canvas.codeMeta', {
              path: container.path,
              start: container.startLine,
              end: container.endLine,
              language: container.language,
            })}
          </p>
        </div>
        <div className="canvas-code-actions">
          {totalLines > COLLAPSED_LINES ? (
            <button
              type="button"
              className="canvas-text-action nodrag"
              aria-expanded={!collapsed}
              onClick={() => data.onToggleCollapse(container.id)}
            >
              {collapsed
                ? t('canvas.showAll', { count: totalLines })
                : t('canvas.collapse')}
            </button>
          ) : null}
          <Link
            to="/p/$projectId/source/$"
            params={{ projectId: data.projectSlug, _splat: container.path }}
            search={{ anchor: container.anchorId, beat: data.beatId }}
            className="canvas-text-action canvas-code-link nodrag"
          >
            {t('canvas.openCodePage')}
          </Link>
        </div>
      </header>
      <div className="canvas-code-body">
        <div className="canvas-code-inner">
          <div
            className="code-excerpt canvas-code-excerpt"
            style={
              {
                '--start-line': String(container.startLine),
              } as CSSProperties
            }
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <div className="canvas-line-handles" aria-hidden="true">
            {Array.from({ length: visibleLines }, (_, index) => {
              const line = container.startLine + index;
              return (
                <Handle
                  key={line}
                  type="target"
                  position={Position.Left}
                  id={canvasCodeLineHandle(line)}
                  isConnectable={false}
                  className="canvas-line-handle"
                  data-linked={linkedLines.has(line)}
                  style={{
                    top: CODE_TOP_PADDING + index * LINE_HEIGHT + LINE_HEIGHT / 2,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
});
