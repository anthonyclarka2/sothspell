import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('generated Sóþspell JSON Schema', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../schema/sothspell.schema.json', import.meta.url), 'utf8'),
  ) as {
    $schema?: string;
    required?: string[];
    properties?: Record<string, unknown>;
  };

  it('is a draft 2020-12 object schema', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.required).toContain('schemaVersion');
    expect(schema.required).toContain('chapters');
    expect(schema.properties?.chapters).toBeDefined();
  });
});
