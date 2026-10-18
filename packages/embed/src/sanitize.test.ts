import { describe, expect, it } from 'vitest';
import { sanitizeCodeHtml } from './sanitize.js';

describe('sanitizeCodeHtml', () => {
  it('keeps compiler-shaped spans with allowed styles', () => {
    const html = '<span style="color:#0f172a;background-color:#fff">const</span> answer';
    expect(sanitizeCodeHtml(html)).toBe(html);
  });

  it('keeps Shiki dual-theme custom properties', () => {
    const html = '<span style="--shiki-light:#0f172a;--shiki-dark:#e2e8f0">const</span>';
    expect(sanitizeCodeHtml(html)).toBe(html);
  });

  it('keeps the compiler line wrapper', () => {
    const html =
      '<span class="line" data-line="1"><span style="color:red">x</span></span>';
    expect(sanitizeCodeHtml(html)).toBe(html);
    expect(
      sanitizeCodeHtml('<span class="line sothspell-line" data-line="2">y</span>'),
    ).toBe('<span class="line sothspell-line" data-line="2">y</span>');
  });

  it('keeps the pre/code wrapper with a sanitized style', () => {
    const html =
      '<pre class="shiki" style="color:#111;background-color:#fff" tabindex="0"><code><span class="line" data-line="1">x</span></code></pre>';
    expect(sanitizeCodeHtml(html)).toBe(html);

    expect(
      sanitizeCodeHtml(
        '<pre class="shiki" style="background-image:url(evil)" tabindex="0"><code>x</code></pre>',
      ),
    ).toBe('<pre class="shiki" tabindex="0"><code>x</code></pre>');
  });

  it('escapes a line wrapper with an injected attribute', () => {
    const html = '<span class="line" data-line="1" onmouseover="alert(1)">x</span>';
    const sanitized = sanitizeCodeHtml(html);

    expect(sanitized).not.toContain('onmouseover="alert(1)"');
    expect(sanitized).toContain('&lt;span');
  });

  it('escapes any other tag and drops scripts and images', () => {
    const html = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const sanitized = sanitizeCodeHtml(html);

    expect(sanitized).not.toContain('<img');
    expect(sanitized).not.toContain('<script');
    expect(sanitized).toContain('&lt;img');
    expect(sanitized).toContain('&lt;script&gt;');
  });

  it('drops dangerous style values but keeps safe properties', () => {
    const html =
      '<span style="background-image:url(javascript:alert(1));color:red">x</span>';
    const sanitized = sanitizeCodeHtml(html);

    expect(sanitized).toBe('<span style="color:red">x</span>');
  });

  it('escapes raw angle brackets in text', () => {
    expect(sanitizeCodeHtml('a < b > c')).toBe('a &lt; b &gt; c');
  });

  it('returns an empty string for non-strings', () => {
    expect(sanitizeCodeHtml(undefined)).toBe('');
    expect(sanitizeCodeHtml(42)).toBe('');
  });
});
