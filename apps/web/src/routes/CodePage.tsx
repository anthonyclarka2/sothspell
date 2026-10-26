import { useEffect, useRef } from 'react';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeft, Code, Warning } from '@phosphor-icons/react';
import { fetchAnchor, type AnchorLine } from '../lib/api.js';
import { useAsync } from '../lib/use-async.js';
import { useLocale } from '../i18n/locale.js';

interface CodeParams {
  projectId: string;
  _splat: string;
}

interface CodeSearch {
  anchor?: string;
  beat?: string;
  tourId?: string;
}

function VirtualCode({ lines, startLine }: { lines: AnchorLine[]; startLine: number }) {
  const { t } = useLocale();
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 14,
  });

  useEffect(() => {
    if (startLine > 0) {
      virtualizer.scrollToIndex(Math.max(0, startLine - 1), { align: 'center' });
    }
  }, [startLine, virtualizer]);

  return (
    <div
      ref={parentRef}
      className="code-viewport"
      data-testid="code-viewport"
      role="region"
      aria-label={t('code.sourceLabel')}
      tabIndex={0}
    >
      <div className="code-virtual" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((item) => {
          const line = lines[item.index];
          if (!line) {
            return null;
          }
          return (
            <div
              key={item.key}
              className={`code-line${line.focus ? ' code-line--focus' : ''}`}
              data-line={line.number}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${item.start}px)`,
              }}
            >
              <span className="code-line-number" aria-hidden="true">
                {line.number}
              </span>
              <span
                className="code-line-content"
                dangerouslySetInnerHTML={{ __html: line.html || '&nbsp;' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CodePage() {
  const params = useParams({ strict: false }) as CodeParams;
  const search = useSearch({ strict: false }) as CodeSearch;
  const navigate = useNavigate();
  const { t } = useLocale();
  const anchorId = search.anchor ?? '';
  const filePath = params['_splat'];

  const anchor = useAsync(
    () => fetchAnchor(params.projectId, filePath, anchorId, search.tourId),
    [params.projectId, filePath, anchorId, search.tourId],
  );

  if (!anchorId) {
    return (
      <div className="page">
        <div className="notice">{t('code.needsAnchor')}</div>
      </div>
    );
  }

  if (anchor.status === 'loading') {
    return (
      <div className="page">
        <p className="notice">{t('code.loading')}</p>
      </div>
    );
  }

  if (anchor.status === 'error' || !anchor.data) {
    return (
      <div className="page">
        <div className="notice">
          <strong>{t('code.loadError')}</strong> {anchor.error?.message}
        </div>
      </div>
    );
  }

  const data = anchor.data;

  return (
    <div className="page code-page">
      <header className="code-page-header">
        <div>
          <div className="crumbs">
            <Link to="/">Sóþspell</Link> / {data.projectId} / {data.path}
          </div>
          <h1>{data.label ?? data.symbol ?? data.path}</h1>
          <div className="crumbs mono">
            {t('code.lines', {
              start: data.startLine,
              end: data.endLine,
              total: data.totalLines,
              language: data.language,
            })}
          </div>
        </div>
        <div className="code-page-actions">
          {data.stale ? (
            <span className="stale-badge" role="status">
              <Warning size={14} weight="fill" />
              {t('code.stale')}
            </span>
          ) : (
            <span className="fresh-badge" role="status">
              <Code size={14} weight="bold" />
              {t('code.fresh')}
            </span>
          )}
          {search.beat ? (
            <Link
              className="secondary-action"
              to="/t/$tourId/$beatId"
              params={{ tourId: data.tourId, beatId: search.beat }}
              search={{ view: undefined }}
            >
              <ArrowLeft size={16} weight="bold" className="rtl-flip" />
              {t('code.backToBeat')}
            </Link>
          ) : null}
        </div>
      </header>

      <div className="code-browser">
        <aside className="code-outline" aria-label={t('code.outlineLabel')}>
          <h2>{t('code.anchors')}</h2>
          {data.outline.length === 0 ? (
            <p className="notice">{t('code.noAnchors')}</p>
          ) : (
            <ol>
              {data.outline.map((entry) => (
                <li key={entry.anchorId}>
                  <button
                    type="button"
                    data-active={entry.anchorId === data.anchorId}
                    onClick={() =>
                      void navigate({
                        to: '/p/$projectId/source/$',
                        params: { projectId: data.projectId, _splat: data.path },
                        search: {
                          anchor: entry.anchorId,
                          beat: entry.beatId,
                          tourId: search.tourId,
                        },
                      })
                    }
                  >
                    <strong>{entry.label}</strong>
                    <span className="mono">
                      L{entry.startLine} · {entry.beatTitle}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </aside>

        <section className="code-card" aria-label={t('code.sourceLabel')}>
          <div className="code-card-header">
            <span className="mono">{data.path}</span>
            <span className="mono">
              {data.contentHash.slice(0, 19)}… · {data.totalLines} lines
            </span>
          </div>
          <VirtualCode lines={data.lines} startLine={data.startLine} />
        </section>
      </div>

      <p className="anchor-meta">{t('code.readOnly')}</p>
    </div>
  );
}
