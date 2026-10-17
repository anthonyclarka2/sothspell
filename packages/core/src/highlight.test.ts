import { describe, expect, it } from 'vitest';
import { highlightCodeLines } from './highlight.js';

describe('highlightCodeLines', () => {
  it('returns one HTML row per line with focus flags', async () => {
    const highlighted = await highlightCodeLines(
      'const a = 1;\nconst b = 2;\n',
      'typescript',
      { startLine: 1, endLine: 1 },
    );

    expect(highlighted.lines).toHaveLength(3);
    expect(highlighted.lines[0]?.number).toBe(1);
    expect(highlighted.lines[0]?.focus).toBe(true);
    expect(highlighted.lines[1]?.focus).toBe(false);
    expect(highlighted.html).toContain('data-line="1"');
    expect(highlighted.html).toContain('sothspell-line');
    expect(highlighted.html).toContain('--shiki-light');
    expect(highlighted.html).toContain('--shiki-dark');
  });

  it('escapes code content rather than emitting raw tags', async () => {
    const highlighted = await highlightCodeLines(
      'const html = "<script>alert(1)</script>";',
      'typescript',
    );

    expect(highlighted.html).not.toContain('<script>');
    expect(highlighted.html).toContain('&lt;script&gt;');
  });
});
