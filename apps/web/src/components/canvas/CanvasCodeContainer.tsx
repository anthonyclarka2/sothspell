import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
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
  const { container, collapsed, symbolId } = data;
  const totalLines = lineCountOf(container.excerpt);
  const visibleLines = collapsed ? Math.min(COLLAPSED_LINES, totalLines) : totalLines;
  const html = useMemo(
    () => shikiHtmlForCanvas(container.html, collapsed ? COLLAPSED_LINES : undefined),
    [collapsed, container.html],
  );
  const linkedLines = new Set(data.linkedLines);
  const explanationId = `canvas-relation-hint-${container.id}`;
  const innerRef = useRef<HTMLDivElement>(null);
  const [lineTops, setLineTops] = useState<number[]>([]);

  // Text scale changes the rendered line height. Re-measure the visible line
  // centres so evidence handles stay on the line they cite instead of using a
  // second hard-coded line height.
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) {
      return;
    }
    const measure = () => {
      const lines = inner.querySelectorAll<HTMLElement>('.shiki .line');
      const tops = Array.from({ length: visibleLines }, (_, index) => {
        const line = lines[index];
        return line
          ? line.offsetTop + line.offsetHeight / 2
          : CODE_TOP_PADDING + index * LINE_HEIGHT + LINE_HEIGHT / 2;
      });
      setLineTops((current) =>
        current.length === tops.length && current.every((top, i) => top === tops[i])
          ? current
          : tops,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(inner);
    return () => observer?.disconnect();
  }, [collapsed, container.html, data.textScale, visibleLines]);

  return (
    <article
      className="canvas-card canvas-code-container"
      data-testid="canvas-code-container"
      data-container-id={container.id}
      data-canvas-container="true"
      data-symbol-id={symbolId}
      data-relation-kind={data.relation?.kind}
      data-focused={data.focused}
      tabIndex={-1}
    >
      <header className="canvas-code-header">
        <div className="canvas-code-identity">
          <h3>
            {symbolId === undefined ? (
              container.label
            ) : (
              <button
                type="button"
                className="canvas-symbol-link nodrag"
                tabIndex={-1}
                data-canvas-item="definition"
                aria-label={t('canvas.openDefinition', { label: container.label })}
                onClick={() => data.onOpenDefinition(symbolId, container.id)}
              >
                {container.label}
              </button>
            )}
          </h3>
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
              tabIndex={-1}
              data-canvas-item="collapse"
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
            search={{
              anchor: container.anchorId,
              beat: data.beatId,
              tourId: data.tourId,
            }}
            tabIndex={-1}
            data-canvas-item="code-page"
            className="canvas-text-action canvas-code-link nodrag"
          >
            {t('canvas.openCodePage')}
          </Link>
        </div>
      </header>
      <div className="canvas-code-toolbar">
        <div
          className="canvas-relation-toggles nodrag"
          role="group"
          aria-label={t('canvas.relationToggleGroup', { label: container.label })}
        >
          <button
            type="button"
            className="canvas-relation-toggle"
            tabIndex={-1}
            data-canvas-item="incoming"
            aria-pressed={data.incoming.active}
            disabled={data.incoming.disabled}
            aria-describedby={data.incoming.disabled ? explanationId : undefined}
            data-relation-direction="incoming"
            data-loading={data.incoming.loading}
            onClick={() => data.onToggleRelation(container.id, 'incoming')}
          >
            {data.incoming.loading ? t('canvas.incomingLoading') : t('canvas.incoming')}
          </button>
          <button
            type="button"
            className="canvas-relation-toggle"
            tabIndex={-1}
            data-canvas-item="outgoing"
            aria-pressed={data.outgoing.active}
            disabled={data.outgoing.disabled}
            aria-describedby={data.outgoing.disabled ? explanationId : undefined}
            data-relation-direction="outgoing"
            data-loading={data.outgoing.loading}
            onClick={() => data.onToggleRelation(container.id, 'outgoing')}
          >
            {data.outgoing.loading ? t('canvas.outgoingLoading') : t('canvas.outgoing')}
          </button>
        </div>
        {data.relation === null ? null : (
          <span
            className="canvas-relation-badge"
            title={t('canvas.relationConfidence', {
              confidence: data.relation.confidence,
            })}
          >
            {t('canvas.relationBadge', {
              relation: data.relation.kind,
              confidence: t('canvas.relationStatic'),
            })}
          </span>
        )}
        {data.incoming.disabled ? (
          <span id={explanationId} className="visually-hidden">
            {t('canvas.noSymbolTarget')}
          </span>
        ) : null}
      </div>
      <div className="canvas-code-body">
        <div ref={innerRef} className="canvas-code-inner">
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
              const top =
                lineTops[index] ??
                CODE_TOP_PADDING + index * LINE_HEIGHT + LINE_HEIGHT / 2;
              return (
                <Handle
                  key={line}
                  type="target"
                  position={Position.Left}
                  id={canvasCodeLineHandle(line)}
                  isConnectable={false}
                  className="canvas-line-handle"
                  data-linked={linkedLines.has(line)}
                  style={{ top }}
                />
              );
            })}
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id="flow-right"
            isConnectable={false}
            className="canvas-flow-handle"
          />
          <Handle
            type="target"
            position={Position.Left}
            id="flow-left"
            isConnectable={false}
            className="canvas-flow-handle"
          />
        </div>
      </div>
    </article>
  );
});
