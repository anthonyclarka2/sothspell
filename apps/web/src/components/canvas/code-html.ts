/**
 * Canvas code cards render the compiler's trusted Shiki HTML directly. Two
 * adjustments belong to the canvas alone: the excerpt must not add a second
 * tab stop beside the card actions, and a collapsed card must keep hidden lines
 * out of the DOM rather than hiding them with CSS.
 */

/** Phase 17 shows at most this many excerpt lines before "Show all". */
export const COLLAPSED_LINES = 24;

export function shikiHtmlForCanvas(html: string, maxLines: number | undefined): string {
  const withoutTabStop = html.replace(
    /(<pre\b[^>]*?)\stabindex="0"/u,
    '$1 tabindex="-1"',
  );
  if (maxLines === undefined) {
    return withoutTabStop;
  }

  const codeStart = withoutTabStop.indexOf('<code>');
  const codeEnd = withoutTabStop.lastIndexOf('</code>');
  if (codeStart === -1 || codeEnd <= codeStart) {
    return withoutTabStop;
  }

  const openTag = withoutTabStop.slice(0, codeStart + '<code>'.length);
  const closeTag = withoutTabStop.slice(codeEnd);
  const lines = withoutTabStop.slice(codeStart + '<code>'.length, codeEnd).split('\n');
  const visible = Math.max(1, Math.floor(maxLines));
  if (lines.length <= visible) {
    return withoutTabStop;
  }
  return `${openTag}${lines.slice(0, visible).join('\n')}${closeTag}`;
}

/** Matches the excerpt line count the package uses to size a card. */
export function lineCountOf(excerpt: string): number {
  return excerpt.split('\n').length;
}
