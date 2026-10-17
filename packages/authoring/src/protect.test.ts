import { describe, expect, it } from 'vitest';
import { protectText, protectValue, restoreText, restoreValue } from './protect.js';

describe('protectText', () => {
  it('protects a known anchor path and restores it', () => {
    const { text, spans } = protectText(
      'The entry point lives in apps/api/src/main.ts today.',
      ['apps/api/src/main.ts'],
    );

    expect(text).toContain('__SS_P0__');
    expect(text).not.toContain('apps/api/src/main.ts');
    expect(spans).toHaveLength(1);
    expect(spans[0]?.value).toBe('apps/api/src/main.ts');
    expect(restoreText(text, spans).text).toBe(
      'The entry point lives in apps/api/src/main.ts today.',
    );
  });

  it('protects camelCase identifiers and inline code', () => {
    const { text, spans } = protectText(
      'Call readSourceRange before touching `Service.bootstrap`.',
    );

    expect(text).toContain('__SS_P0__');
    expect(text).toContain('__SS_P1__');
    expect(text).not.toContain('readSourceRange');
    expect(text).not.toContain('`Service.bootstrap`');
    expect(spans.map((span) => span.value)).toEqual([
      'readSourceRange',
      '`Service.bootstrap`',
    ]);
  });

  it('leaves ordinary prose alone', () => {
    const { text, spans } = protectText('The browser sends a request to the server.');

    expect(spans).toEqual([]);
    expect(text).toBe('The browser sends a request to the server.');
  });

  it('reports a lost placeholder', () => {
    const { spans } = protectText('Use readSourceRange here.');
    const restored = restoreText('Use the helper here.', spans);

    expect(restored.issues.join(' ')).toMatch(/missing/);
  });

  it('reports an invented placeholder', () => {
    const restored = restoreText('Use __SS_P9__ here.', []);

    expect(restored.issues.join(' ')).toMatch(/unknown placeholder/);
  });
});

describe('protectValue', () => {
  it('protects every string in a unit with unique placeholders', () => {
    const { value, spans } = protectValue(
      {
        id: 'beat_one',
        title: 'The readSourceRange helper',
        narration: 'readSourceRange reads from apps/api/src/main.ts.',
        suggestedQuestions: ['Where is apps/api/src/main.ts?'],
      },
      ['apps/api/src/main.ts'],
    );

    expect(spans).toHaveLength(5);
    expect(new Set(spans.map((span) => span.placeholder)).size).toBe(5);
    expect(spans.map((span) => span.value)).toContain('beat_one');
    expect(JSON.stringify(value)).not.toContain('apps/api/src/main.ts');

    const restored = restoreValue(value, spans);
    expect(restored.issues).toEqual([]);
    expect(restored.value).toMatchObject({
      id: 'beat_one',
      title: 'The readSourceRange helper',
      narration: 'readSourceRange reads from apps/api/src/main.ts.',
      suggestedQuestions: ['Where is apps/api/src/main.ts?'],
    });
  });
});
