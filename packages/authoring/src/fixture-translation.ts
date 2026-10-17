import { FakeGuideModel } from './fake-model.js';

/**
 * A deterministic translation model for tests, the CLI's `--model fixture`
 * mode, and offline demos. It answers a translation prompt by prefixing every
 * human-facing string with a locale marker while leaving ids, keys, and
 * protected placeholders alone. It is not a substitute for a reviewed
 * translation; it exists so the pipeline can run without a provider key.
 */

/** The length bound each unit field must satisfy after prefixing. */
const FIELD_LIMITS: Record<string, number> = {
  title: 96,
  subtitle: 160,
  summary: 400,
  narration: 1200,
  suggestedQuestions: 240,
  nodeLabels: 48,
  edgeLabels: 32,
};

function limitForPath(path: readonly string[]): number {
  const key = path[path.length - 1] ?? '';
  return FIELD_LIMITS[key] ?? 240;
}

/** Pulls the first fenced JSON block out of a prompt. */
export function sourceUnitFromPrompt(prompt: string): unknown {
  const match = /```json\n([\s\S]*?)\n```/.exec(prompt);
  if (!match?.[1]) {
    throw new Error('the prompt has no source JSON block');
  }
  return JSON.parse(match[1]) as unknown;
}

function markValue(value: unknown, marker: string, path: string[]): unknown {
  if (typeof value === 'string') {
    if (path[path.length - 1] === 'id') {
      return value;
    }
    const marked = `${marker}${value}`;
    // Keep the answer inside the schema bounds; a string that cannot carry the
    // marker stays as-is rather than failing validation.
    return marked.length <= limitForPath(path) ? marked : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => markValue(item, marker, path));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        markValue(item, marker, [...path, key]),
      ]),
    );
  }
  return value;
}

export function createFixtureTranslationModel(
  locale: string,
  id = `fixture-translation-${locale}`,
): FakeGuideModel {
  const marker = `«${locale}» `;
  return new FakeGuideModel(({ prompt }) => {
    const source = sourceUnitFromPrompt(prompt);
    return markValue(source, marker, []);
  }, id);
}
