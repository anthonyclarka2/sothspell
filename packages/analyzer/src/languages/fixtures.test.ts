import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hashText } from '@sothspell/core';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '../analyze.js';
import { resolveAnchor } from '../anchor.js';
import { buildProjectBrief, renderProjectBriefMarkdown } from '../brief.js';
import type { ProjectSnapshot } from '../types.js';

const fixturesRoot = path.join(import.meta.dirname, '..', '..', 'fixtures');
const temporaryRoots: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryRoots.map((root) => rm(root, { recursive: true, force: true })),
  );
});

/**
 * The snapshot id, fingerprint, creation time, and duration are the parts that
 * are allowed to differ between two runs of the same content; everything else
 * must be byte-identical for the snapshot to be deterministic.
 */
function deterministicJson(snapshot: ProjectSnapshot): string {
  return JSON.stringify(
    {
      ...snapshot,
      id: undefined,
      createdAt: undefined,
      project: { ...snapshot.project, fingerprint: undefined },
      analysis: { ...snapshot.analysis, durationMs: undefined },
    },
    null,
    2,
  );
}

describe('fixture snapshots', () => {
  for (const fixture of ['python', 'go', 'rust', 'java'] as const) {
    it(`is deterministic for the ${fixture} fixture`, async () => {
      const root = path.join(fixturesRoot, fixture);
      const first = await analyzeProject(root);
      const second = await analyzeProject(root);

      expect(second.id).toBe(first.id);
      expect(deterministicJson(second)).toBe(deterministicJson(first));
      expect(first.symbols.length).toBeGreaterThan(3);
      expect(first.manifests.length).toBeGreaterThan(0);
      expect(first.graph.entryPoints.length).toBeGreaterThan(0);
    });

    it(`resolves, and detects stale, anchors in the ${fixture} fixture`, async () => {
      const root = path.join(fixturesRoot, fixture);
      const snapshot = await analyzeProject(root);
      const symbol =
        snapshot.symbols.find(
          (candidate) => candidate.kind !== 'module' && candidate.exported,
        ) ?? snapshot.symbols.find((candidate) => candidate.kind !== 'module');
      expect(symbol, `an anchorable symbol in ${fixture}`).toBeDefined();
      if (!symbol) {
        return;
      }

      const lines = (await readFile(path.join(root, symbol.path), 'utf8')).split('\n');
      const excerpt = lines.slice(symbol.startLine - 1, symbol.endLine).join('\n');

      const resolved = await resolveAnchor(snapshot, root, {
        path: symbol.path,
        symbol: symbol.qualifiedName,
        lines: { start: 1, end: 1 },
        contentHash: hashText(excerpt),
      });
      expect(resolved?.symbolId).toBe(symbol.id);
      expect(resolved?.startLine).toBe(symbol.startLine);
      expect(resolved?.endLine).toBe(symbol.endLine);

      // A changed excerpt is stale: the symbol is found but the hash refuses.
      await expect(
        resolveAnchor(snapshot, root, {
          path: symbol.path,
          symbol: symbol.qualifiedName,
          lines: { start: symbol.startLine, end: symbol.endLine },
          contentHash: hashText('not the fixture any more'),
        }),
      ).resolves.toBeNull();

      // An unknown symbol falls back to the line hint and still verifies.
      const resolvedByHint = await resolveAnchor(snapshot, root, {
        path: symbol.path,
        symbol: 'does.not.exist',
        lines: { start: symbol.startLine, end: symbol.endLine },
        contentHash: hashText(excerpt),
      });
      expect(resolvedByHint?.symbolId).toBeNull();
      expect(resolvedByHint?.startLine).toBe(symbol.startLine);
    });

    it(`renders the ${fixture} brief with its build system`, async () => {
      const root = path.join(fixturesRoot, fixture);
      const snapshot = await analyzeProject(root);
      const brief = buildProjectBrief(snapshot);
      const markdown = renderProjectBriefMarkdown(brief);

      expect(brief.languageBriefs).toHaveLength(1);
      expect(brief.languageBriefs[0]?.primary).toBe(true);
      expect(brief.languageBriefs[0]?.buildSystems.length).toBe(1);
      expect(markdown).toContain(`### ${fixture}`);
      expect(markdown).toContain('- Build:');
      expect(markdown).toContain('- Entry points:');
      expect(markdown).toContain('## Language briefs');
    });

    it(`keeps the ${fixture} manifest anchorable`, async () => {
      const root = path.join(fixturesRoot, fixture);
      const snapshot = await analyzeProject(root);
      const manifest = snapshot.manifests[0];
      expect(manifest).toBeDefined();
      if (!manifest) {
        return;
      }

      const entry = snapshot.files.find((file) => file.path === manifest.path);
      expect(entry?.hash).toMatch(/^sha256:[a-f0-9]{64}$/);

      const lines = (await readFile(path.join(root, manifest.path), 'utf8')).split('\n');
      const endLine = Math.min(3, lines.length);
      const excerpt = lines.slice(0, endLine).join('\n');
      const resolved = await resolveAnchor(snapshot, root, {
        path: manifest.path,
        lines: { start: 1, end: endLine },
        contentHash: hashText(excerpt),
      });

      expect(resolved?.contentHash).toBe(hashText(excerpt));
      expect(resolved?.excerpt).toBe(excerpt);
    });
  }
});

async function makeMixedProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-mixed-'));
  temporaryRoots.push(root);
  await mkdir(path.join(root, 'python'), { recursive: true });
  await mkdir(path.join(root, 'go'), { recursive: true });
  await mkdir(path.join(root, 'java'), { recursive: true });
  await writeFile(
    path.join(root, 'python', 'app.py'),
    'def main() -> None:\n    pass\n\nif __name__ == "__main__":\n    main()\n',
  );
  await writeFile(path.join(root, 'go', 'main.go'), 'package main\n\nfunc main() {}\n');
  await writeFile(
    path.join(root, 'java', 'Main.java'),
    'package demo;\n\npublic class Main {\n  public static void main(String[] args) {}\n}\n',
  );
  await writeFile(path.join(root, 'README.md'), '# Mixed\n\nThree languages.\n');
  return root;
}

describe('mixed-language project', () => {
  it('records every language with one primary chosen by bytes', async () => {
    const root = await makeMixedProject();
    const snapshot = await analyzeProject(root);

    const sourceLanguages = snapshot.languages.filter((entry) => entry.primary);
    expect(sourceLanguages).toHaveLength(1);
    expect(snapshot.languages.map((entry) => entry.language)).toEqual([
      'go',
      'java',
      'markdown',
      'python',
    ]);
    expect(snapshot.languages.find((entry) => entry.language === 'python')?.id).toBe(
      'python',
    );
    expect(snapshot.languages.find((entry) => entry.language === 'markdown')?.id).toBe(
      'markdown',
    );

    const brief = buildProjectBrief(snapshot);
    expect(brief.languageBriefs.map((entry) => entry.id)).toEqual([
      'go',
      'java',
      'python',
    ]);
    expect(brief.languageBriefs.filter((entry) => entry.primary)).toHaveLength(1);
    expect(snapshot.graph.entryPoints).toEqual([
      'go/main.go',
      'java/Main.java',
      'python/app.py',
    ]);
  });

  it('loads each detected grammar and records its cost', async () => {
    const root = await makeMixedProject();
    const snapshot = await analyzeProject(root);

    expect(
      snapshot.analysis.languageRuntimes.map((runtime) => runtime.id).toSorted(),
    ).toEqual(['go', 'java', 'python']);
    for (const runtime of snapshot.analysis.languageRuntimes) {
      expect(runtime.grammarBytes).toBeGreaterThan(100_000);
      expect(runtime.abiVersion).toBeGreaterThanOrEqual(13);
    }
  });

  it('is deterministic for the mixed project', async () => {
    const root = await makeMixedProject();
    const first = await analyzeProject(root);
    const second = await analyzeProject(root);

    expect(second.id).toBe(first.id);
    expect(deterministicJson(second)).toBe(deterministicJson(first));
  });
});

describe('lazy grammar loading', () => {
  it('loads no grammar for a TypeScript-only project', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'sothspell-ts-only-'));
    temporaryRoots.push(root);
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'ts-only', version: '1.0.0' }),
    );
    await writeFile(
      path.join(root, 'src', 'main.ts'),
      'export function main(): void {}\n',
    );

    const snapshot = await analyzeProject(root);

    expect(snapshot.analysis.languageRuntimes).toEqual([]);
    expect(
      snapshot.languages.find((entry) => entry.language === 'typescript'),
    ).toMatchObject({ id: 'typescript', primary: true });
    expect(snapshot.manifests).toEqual([]);
  });
});
