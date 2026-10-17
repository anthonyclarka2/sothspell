import type { CSSProperties } from 'react';
import type { CompiledAnchor } from '../types.js';

export interface CodeExcerptProps {
  anchor: CompiledAnchor | null;
}

/**
 * The excerpt HTML is compiled once at export time by the core compiler
 * (Shiki), so the embed ships no highlighter and never reads the repository.
 * The HTML is generated output, not model output; the compiler escapes every
 * token before wrapping it.
 */
export function CodeExcerpt({ anchor }: CodeExcerptProps) {
  if (!anchor) {
    return (
      <div className="panel-empty">This beat focuses a diagram rather than a file.</div>
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
      <div className="anchor-meta">
        <strong>{anchor.label ?? anchor.symbol ?? anchor.path}</strong>
        <span className="mono">
          {anchor.path}:{anchor.startLine}-{anchor.endLine}
        </span>
      </div>
    </div>
  );
}
