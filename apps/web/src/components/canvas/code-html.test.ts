import { describe, expect, it } from 'vitest';
import { lineCountOf, shikiHtmlForCanvas } from './code-html.js';

const THREE_LINES =
  '<pre class="shiki" style="color:#111" tabindex="0"><code>' +
  '<span class="line" data-line="1">one</span>\n' +
  '<span class="line" data-line="2">two</span>\n' +
  '<span class="line" data-line="3">three</span>' +
  '</code></pre>';

describe('canvas code HTML', () => {
  it('removes the Shiki tab stop so the card has one keyboard entry point', () => {
    const html = shikiHtmlForCanvas(THREE_LINES, undefined);
    expect(html).not.toContain('tabindex="0"');
    expect(html).toContain('tabindex="-1"');
  });

  it('keeps only the visible lines and leaves collapsed lines out of the DOM', () => {
    const html = shikiHtmlForCanvas(THREE_LINES, 2);
    expect(html).toContain('data-line="1"');
    expect(html).toContain('data-line="2"');
    expect(html).not.toContain('data-line="3"');
    expect(html).toContain('<pre class="shiki"');
    expect(html.endsWith('</code></pre>')).toBe(true);
  });

  it('keeps every line when the container is expanded', () => {
    const html = shikiHtmlForCanvas(THREE_LINES, 24);
    expect(html).toContain('data-line="3"');
  });

  it('returns unchanged markup when there is no Shiki code wrapper', () => {
    expect(shikiHtmlForCanvas('<p>plain</p>', 2)).toBe('<p>plain</p>');
  });

  it('counts excerpt lines instead of parsing markup', () => {
    expect(lineCountOf('one')).toBe(1);
    expect(lineCountOf('one\ntwo\n')).toBe(3);
  });
});
