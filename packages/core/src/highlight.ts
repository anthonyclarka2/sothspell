import { createHighlighter, type Highlighter } from 'shiki';

export interface HighlightedLine {
  number: number;
  html: string;
  focus: boolean;
}

export interface HighlightedCode {
  language: string;
  lines: HighlightedLine[];
  html: string;
}

let highlighterPromise: Promise<Highlighter> | undefined;

export function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= createHighlighter({
    themes: ['github-light-high-contrast', 'github-dark-high-contrast'],
    langs: [
      'typescript',
      'tsx',
      'javascript',
      'jsx',
      'svelte',
      'json',
      'jsonc',
      'markdown',
      'mdx',
      'prisma',
      'css',
      'html',
      'bash',
      'sql',
      'yaml',
      'python',
      'go',
      'rust',
      'java',
      'plaintext',
    ],
  });
  return highlighterPromise;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function styleOf(token: {
  color?: string;
  bgColor?: string;
  fontStyle?: number;
  htmlStyle?: Record<string, string>;
}): string {
  if (token.htmlStyle) {
    return Object.entries(token.htmlStyle)
      .map(([key, value]) => `${key}:${value}`)
      .join(';');
  }
  const style: string[] = [];
  if (token.color) {
    style.push(`color:${token.color}`);
  }
  if (token.bgColor) {
    style.push(`background-color:${token.bgColor}`);
  }
  if (token.fontStyle === 1) {
    style.push('font-style:italic');
  } else if (token.fontStyle === 2) {
    style.push('font-weight:bold');
  } else if (token.fontStyle === 4) {
    style.push('text-decoration:underline');
  }
  return style.join(';');
}

/**
 * Highlights a whole file into line HTML. The line array is what the code
 * browser virtualizes; the `focus` flag marks the anchor's range without
 * changing the layout. The generated HTML is trusted output from Shiki's
 * tokenizer, with every token escaped before it is wrapped.
 */
export async function highlightCodeLines(
  code: string,
  language: string,
  focus?: { startLine: number; endLine: number },
): Promise<HighlightedCode> {
  const highlighter = await getHighlighter();
  const result = await highlighter.codeToTokens(code, {
    lang: language as Parameters<Highlighter['codeToTokens']>[1]['lang'],
    themes: {
      light: 'github-light-high-contrast',
      dark: 'github-dark-high-contrast',
    },
    defaultColor: false,
  });

  const lines: HighlightedLine[] = result.tokens.map((tokens, index) => {
    const number = index + 1;
    const html = tokens
      .map((token) => {
        const style = styleOf(token);
        const content = escapeHtml(token.content);
        return style.length > 0 ? `<span style="${style}">${content}</span>` : content;
      })
      .join('');
    const inFocus =
      focus !== undefined && number >= focus.startLine && number <= focus.endLine;
    return { number, html, focus: inFocus };
  });

  const rootStyle = Object.entries(result.rootStyle ?? {})
    .map(([key, value]) => `${key}:${value}`)
    .join(';');

  const lineMarkup = lines
    .map(
      (line) =>
        `<span class="line${line.focus ? ' sothspell-line' : ''}" data-line="${line.number}">${line.html || '&nbsp;'}</span>`,
    )
    .join('\n');

  return {
    language,
    lines,
    html: `<pre class="shiki" style="${rootStyle}" tabindex="0"><code>${lineMarkup}</code></pre>`,
  };
}
