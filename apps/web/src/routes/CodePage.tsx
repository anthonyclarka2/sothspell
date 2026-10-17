import { Link, useParams, useSearch } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { ArrowLeft, Code } from '@phosphor-icons/react';
import { fetchAnchor } from '../lib/api.js';
import { useAsync } from '../lib/use-async.js';

interface CodeParams {
  projectId: string;
  _splat: string;
}

interface CodeSearch {
  anchor?: string;
  beat?: string;
}

export function CodePage() {
  const params = useParams({ strict: false }) as CodeParams;
  const search = useSearch({ strict: false }) as CodeSearch;
  const anchorId = search.anchor ?? '';
  const filePath = params['_splat'];

  const anchor = useAsync(
    () => fetchAnchor(params.projectId, filePath, anchorId),
    [params.projectId, filePath, anchorId],
  );

  if (!anchorId) {
    return (
      <div className="page">
        <div className="notice">
          This code page needs an anchor. Open it from a beat or a diagram node.
        </div>
      </div>
    );
  }

  if (anchor.status === 'loading') {
    return (
      <div className="page">
        <p className="notice">Loading the evidence…</p>
      </div>
    );
  }

  if (anchor.status === 'error' || !anchor.data) {
    return (
      <div className="page">
        <div className="notice">
          <strong>The code page did not load.</strong> {anchor.error?.message}
        </div>
      </div>
    );
  }

  const data = anchor.data;

  return (
    <div className="page">
      <header className="code-page-header">
        <div>
          <div className="crumbs">
            <Link to="/">Sóþspell</Link> / {data.projectId} / {data.path}
          </div>
          <h1>{data.label ?? data.symbol ?? data.path}</h1>
          <div className="crumbs mono">
            lines {data.startLine}–{data.endLine} · {data.language}
          </div>
        </div>
        {search.beat ? (
          <Link
            className="secondary-action"
            to="/t/$tourId/$beatId"
            params={{ tourId: data.tourId, beatId: search.beat }}
          >
            <ArrowLeft size={16} weight="bold" />
            Back to the beat
          </Link>
        ) : null}
      </header>

      <div className="code-card">
        <div className="code-card-header">
          <span className="mono">{data.path}</span>
          <span>
            <Code size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            pinned at {data.contentHash.slice(0, 19)}…
          </span>
        </div>
        <div
          className="code-excerpt"
          style={{ '--start-line': String(data.startLine) } as CSSProperties}
        >
          <div dangerouslySetInnerHTML={{ __html: data.html }} />
        </div>
      </div>

      <p className="anchor-meta">
        This is a read-only excerpt from the pinned Bunbun snapshot. The full tour never
        writes to the project.
      </p>
    </div>
  );
}
