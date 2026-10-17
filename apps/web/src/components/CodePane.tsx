import { Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import type { CompiledBeat } from '@sothspell/core';

export interface CodePaneProps {
  projectSlug: string;
  beat: CompiledBeat;
}

export function CodePane({ projectSlug, beat }: CodePaneProps) {
  const anchor = beat.anchors[0];

  if (!anchor) {
    return (
      <div className="panel-body" style={{ display: 'grid', placeItems: 'center' }}>
        <p className="notice">This beat focuses a diagram rather than a file.</p>
      </div>
    );
  }

  return (
    <div className="panel-body">
      <div
        className="code-excerpt"
        style={{ '--start-line': String(anchor.startLine) } as CSSProperties}
      >
        <div dangerouslySetInnerHTML={{ __html: anchor.html }} />
      </div>
      <div className="anchor-meta" style={{ padding: '0 16px 18px' }}>
        <div>
          <strong>{anchor.label ?? anchor.symbol ?? anchor.path}</strong>
        </div>
        <div className="mono">
          {anchor.path}:{anchor.startLine}-{anchor.endLine}
        </div>
        <Link
          to="/p/$projectId/source/$"
          params={{ projectId: projectSlug, _splat: anchor.path }}
          search={{ anchor: anchor.id, beat: beat.id }}
        >
          Open code page
        </Link>
      </div>
    </div>
  );
}
