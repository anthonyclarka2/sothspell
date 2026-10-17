import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hashText } from '@sothspell/core';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeProject } from './analyze.js';
import { resolveAnchor } from './anchor.js';

const roots: string[] = [];

async function makeProject(): Promise<{ root: string; text: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-anchor-'));
  roots.push(root);
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'anchor-fixture' }),
  );
  const text = [
    'export class Service {',
    '  run(value: string): string {',
    '    return value;',
    '  }',
    '}',
  ].join('\n');
  await writeFile(path.join(root, 'src', 'service.ts'), `${text}\n`);
  return { root, text };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('anchor resolution', () => {
  it('resolves a symbol to its line range and verifies the hash', async () => {
    const { root, text } = await makeProject();
    const snapshot = await analyzeProject(root);
    const symbolText = text.split('\n').slice(1, 4).join('\n');
    const anchor = {
      path: 'src/service.ts',
      symbol: 'Service.run',
      lines: { start: 1, end: 4 },
      contentHash: hashText(symbolText),
    };

    const resolved = await resolveAnchor(snapshot, root, anchor);

    expect(resolved?.symbolId).toBe('symbol:src/service.ts#Service.run');
    expect(resolved?.startLine).toBe(2);
    expect(resolved?.endLine).toBe(4);
    expect(resolved?.contentHash).toBe(hashText(symbolText));
  });

  it('falls back to the line hint when the symbol is not found', async () => {
    const { root, text } = await makeProject();
    const snapshot = await analyzeProject(root);
    const resolved = await resolveAnchor(snapshot, root, {
      path: 'src/service.ts',
      symbol: 'Missing.run',
      lines: { start: 1, end: 2 },
      contentHash: hashText(text.split('\n').slice(0, 2).join('\n')),
    });

    expect(resolved?.symbolId).toBeNull();
    expect(resolved?.startLine).toBe(1);
    expect(resolved?.endLine).toBe(2);
  });

  it('returns null when the hash does not match', async () => {
    const { root } = await makeProject();
    const snapshot = await analyzeProject(root);

    await expect(
      resolveAnchor(snapshot, root, {
        path: 'src/service.ts',
        symbol: 'Service.run',
        lines: { start: 2, end: 4 },
        contentHash: hashText('not the file'),
      }),
    ).resolves.toBeNull();
  });
});
