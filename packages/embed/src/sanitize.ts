import type { EmbedTour } from './types.js';

/**
 * The embed can load a tour from any URL the host allows, so the compiled
 * `anchor.html` in that JSON is untrusted input. Only the exact shape the core
 * compiler emits survives: text and `<span style="...">` wrappers with a small
 * allowlist of style properties. Everything else is escaped as text.
 */

const STYLE_PROPERTIES: ReadonlySet<string> = new Set([
  'color',
  'background-color',
  'font-style',
  'font-weight',
  'text-decoration',
]);

/** Shiki's dual-theme custom properties; they carry only color values. */
const CUSTOM_PROPERTY = /^--shiki-[a-z0-9-]{1,32}$/u;

/** The compiler's line wrapper: `<span class="line" data-line="1">`. */
const LINE_SPAN = /^<span class="line(?: sothspell-line)?" data-line="\d{1,9}">$/u;

/** The compiler's pre/code wrapper, with an optional sanitized style. */
const PRE_TAG = /^<pre class="shiki"(?: style="([^"]*)")? tabindex="0">$/u;

const STYLE_VALUE = /^[#a-zA-Z0-9 ,.%()!-]+$/u;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeStyle(value: string): string {
  const kept: string[] = [];
  for (const part of value.split(';')) {
    const separator = part.indexOf(':');
    if (separator === -1) {
      continue;
    }
    const property = part.slice(0, separator).trim().toLowerCase();
    const styleValue = part.slice(separator + 1).trim();
    if (!STYLE_PROPERTIES.has(property) && !CUSTOM_PROPERTY.test(property)) {
      continue;
    }
    if (
      styleValue.length === 0 ||
      styleValue.length > 120 ||
      !STYLE_VALUE.test(styleValue) ||
      /url|expression|javascript/iu.test(styleValue)
    ) {
      continue;
    }
    kept.push(`${property}:${styleValue}`);
  }
  return kept.join(';');
}

export function sanitizeCodeHtml(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0) {
    return '';
  }
  let output = '';
  for (const token of input.split(/(<[^>]*>)/gu)) {
    if (token.length === 0) {
      continue;
    }
    if (token.startsWith('<')) {
      if (token === '</span>' || token === '</code>' || token === '</pre>') {
        output += token;
        continue;
      }
      if (token === '<code>') {
        output += token;
        continue;
      }
      const preMatch = PRE_TAG.exec(token);
      if (preMatch) {
        const style = sanitizeStyle(preMatch[1] ?? '');
        output +=
          style.length > 0
            ? `<pre class="shiki" style="${style}" tabindex="0">`
            : '<pre class="shiki" tabindex="0">';
        continue;
      }
      if (LINE_SPAN.test(token)) {
        output += token;
        continue;
      }
      const match = /^<span style="([^"]*)">$/u.exec(token);
      if (match) {
        const style = sanitizeStyle(match[1] ?? '');
        output += style.length > 0 ? `<span style="${style}">` : '<span>';
        continue;
      }
      output += escapeHtml(token);
      continue;
    }
    output += token.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }
  return output;
}

export function sanitizeTourHtml(tour: EmbedTour): EmbedTour {
  return {
    ...tour,
    chapters: tour.chapters.map((chapter) => ({
      ...chapter,
      beats: chapter.beats.map((beat) => ({
        ...beat,
        anchors: beat.anchors.map((anchor) => ({
          ...anchor,
          html: sanitizeCodeHtml(anchor.html),
        })),
      })),
    })),
  };
}
