import { sanitizeCodeHtml } from '../sanitize.js';
import type { CSSProperties } from 'react';
import type { CompiledAnchor } from '../types.js';

export interface CodeExcerptProps {
  anchor: CompiledAnchor | null;
}

/**
 * The excerpt HTML is compiled once at export time by the core compiler
 * (Shiki), but the embed can load a tour from any allowed URL, so the HTML is
 * treated as untrusted and sanitized at the render boundary too.
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
        <div dangerouslySetInnerHTML={{ __html: sanitizeCodeHtml(anchor.html) }} />
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
