/**
 * Protected spans for translation. A translation model must never rename a
 * symbol, rewrite a path, or edit a code excerpt that the narration quotes, so
 * every such token is swapped for an opaque placeholder before the prompt is
 * built and restored only after the model answers. Placeholders are deliberately
 * shaped like identifiers (`__SS_P0__`) so a model treats them as opaque.
 */

export type ProtectedSpanKind = 'anchor' | 'code' | 'identifier' | 'path';

export interface ProtectedSpan {
  placeholder: string;
  value: string;
  kind: ProtectedSpanKind;
}

export interface ProtectedText {
  text: string;
  spans: ProtectedSpan[];
}

const FENCED_CODE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]+`/g;
const PATH = /(?:[\w@.-]+\/)+[\w@.-]+/g;
const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;
const PLACEHOLDER = /__SS_P\d+__/g;

/**
 * A code-identifier heuristic: camelCase, snake_case, dotted names, and
 * ALL_CAPS acronyms are protected; ordinary prose words are not, so the model
 * can still translate a sentence.
 */
function looksLikeIdentifier(token: string): boolean {
  if (token.length < 2) {
    return false;
  }
  if (token.includes('_') || token.includes('$')) {
    return true;
  }
  if (/[a-z][A-Z]/.test(token)) {
    return true;
  }
  if (token.length >= 3 && /^[A-Z][A-Z0-9]+$/.test(token)) {
    return true;
  }
  return false;
}

interface Candidate {
  start: number;
  end: number;
  value: string;
  kind: ProtectedSpanKind;
}

function collect(text: string, vocabulary: readonly string[]): Candidate[] {
  const candidates: Candidate[] = [];

  const pushMatches = (pattern: RegExp, kind: ProtectedSpanKind): void => {
    for (const match of text.matchAll(pattern)) {
      const value = match[0];
      if (match.index !== undefined && value.length > 0) {
        candidates.push({
          start: match.index,
          end: match.index + value.length,
          value,
          kind,
        });
      }
    }
  };

  pushMatches(FENCED_CODE, 'code');
  pushMatches(INLINE_CODE, 'code');
  pushMatches(PATH, 'path');
  for (const match of text.matchAll(IDENTIFIER)) {
    const value = match[0];
    if (match.index !== undefined && looksLikeIdentifier(value)) {
      candidates.push({
        start: match.index,
        end: match.index + value.length,
        value,
        kind: 'identifier',
      });
    }
  }

  // Known document vocabulary (anchor ids, paths, symbols) is protected even
  // when the token alone would look like ordinary prose.
  for (const term of vocabulary) {
    if (term.length === 0) {
      continue;
    }
    let index = text.indexOf(term);
    while (index !== -1) {
      candidates.push({
        start: index,
        end: index + term.length,
        value: term,
        kind: 'anchor',
      });
      index = text.indexOf(term, index + 1);
    }
  }

  return candidates;
}

interface Counter {
  next: number;
}

function protectWithCounter(
  text: string,
  vocabulary: readonly string[],
  counter: Counter,
): ProtectedText {
  const candidates = collect(text, vocabulary)
    // Longest first at the same start, then by position, so a path inside
    // backticks is protected as one code span rather than two overlapping ones.
    .toSorted((left, right) =>
      left.start === right.start
        ? right.end - right.start - (left.end - left.start)
        : left.start - right.start,
    );

  const chosen: Candidate[] = [];
  let lastEnd = -1;
  for (const candidate of candidates) {
    if (candidate.start < lastEnd) {
      continue;
    }
    chosen.push(candidate);
    lastEnd = candidate.end;
  }

  if (chosen.length === 0) {
    return { text, spans: [] };
  }

  let output = '';
  let cursor = 0;
  const spans: ProtectedSpan[] = [];
  for (const candidate of chosen) {
    const placeholder = `__SS_P${counter.next}__`;
    counter.next += 1;
    output += text.slice(cursor, candidate.start) + placeholder;
    cursor = candidate.end;
    spans.push({ placeholder, value: candidate.value, kind: candidate.kind });
  }
  output += text.slice(cursor);

  return { text: output, spans };
}

/** Replaces protected tokens in one string with placeholders. */
export function protectText(
  text: string,
  vocabulary: readonly string[] = [],
): ProtectedText {
  return protectWithCounter(text, vocabulary, { next: 0 });
}

/** Replaces the placeholders that occur in one string; reports unknown ones. */
function replacePlaceholders(
  text: string,
  spans: readonly ProtectedSpan[],
  used: Set<string> | null,
): { text: string; issues: string[] } {
  const issues: string[] = [];
  let restored = text;

  for (const span of spans) {
    if (restored.includes(span.placeholder)) {
      used?.add(span.placeholder);
      restored = restored.split(span.placeholder).join(span.value);
    }
  }

  const known = new Set(spans.map((span) => span.placeholder));
  for (const match of restored.matchAll(PLACEHOLDER)) {
    if (!known.has(match[0])) {
      issues.push(`the translation contains an unknown placeholder ${match[0]}`);
    }
  }

  return { text: restored, issues };
}

/** Restores placeholders in one string and reports any that were lost or invented. */
export function restoreText(
  text: string,
  spans: readonly ProtectedSpan[],
): { text: string; issues: string[] } {
  const issues: string[] = [];
  const restored = replacePlaceholders(text, spans, null);
  issues.push(...restored.issues);

  for (const span of spans) {
    if (!restored.text.includes(span.value) && !text.includes(span.placeholder)) {
      issues.push(
        `the placeholder ${span.placeholder} for ${JSON.stringify(span.value)} is missing from the translation`,
      );
    }
  }

  return { text: restored.text, issues };
}

/** Protects every string in a JSON-shaped unit, sharing one placeholder counter. */
export function protectValue(
  value: unknown,
  vocabulary: readonly string[] = [],
): { value: unknown; spans: ProtectedSpan[] } {
  const counter: Counter = { next: 0 };
  const spans: ProtectedSpan[] = [];

  const walk = (input: unknown): unknown => {
    if (typeof input === 'string') {
      const protectedText = protectWithCounter(input, vocabulary, counter);
      spans.push(...protectedText.spans);
      return protectedText.text;
    }
    if (Array.isArray(input)) {
      return input.map((item) => walk(item));
    }
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([key, item]) => [
          key,
          walk(item),
        ]),
      );
    }
    return input;
  };

  return { value: walk(value), spans };
}

/** Restores placeholders across a JSON-shaped unit and collects every issue. */
export function restoreValue(
  value: unknown,
  spans: readonly ProtectedSpan[],
): { value: unknown; issues: string[] } {
  const issues: string[] = [];
  const used = new Set<string>();

  const walk = (input: unknown): unknown => {
    if (typeof input === 'string') {
      const restored = replacePlaceholders(input, spans, used);
      issues.push(...restored.issues);
      return restored.text;
    }
    if (Array.isArray(input)) {
      return input.map((item) => walk(item));
    }
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([key, item]) => [
          key,
          walk(item),
        ]),
      );
    }
    return input;
  };

  const restored = walk(value);

  // A placeholder belongs to one string in the unit; it must be restored in
  // exactly that string, and a unit-wide check is what catches a dropped one.
  for (const span of spans) {
    if (!used.has(span.placeholder)) {
      issues.push(
        `the placeholder ${span.placeholder} for ${JSON.stringify(span.value)} is missing from the translation`,
      );
    }
  }

  return { value: restored, issues };
}
