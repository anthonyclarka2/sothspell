import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { SOTHSPELL_VERSION } from './version.js';

describe('version', () => {
  it('matches the root package version', async () => {
    const rootPackage = JSON.parse(
      await readFile(new URL('../../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };

    expect(SOTHSPELL_VERSION).toBe(rootPackage.version);
  });
});
