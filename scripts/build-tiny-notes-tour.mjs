#!/usr/bin/env node
/** Rebuild the built-in tour and source integrity manifest from one tracked revision. */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { analyzeProject } from '../packages/analyzer/src/index.ts';
import { compileSothspell, hashText } from '../packages/core/src/index.ts';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'examples', 'tiny-notes-tour');
const prefix = 'examples/tiny-notes/';
const document = JSON.parse(
  await readFile(path.join(output, 'tour.source.json'), 'utf8'),
);
const revision = document.project.revision.commit;
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

const sources = new Map();
for (const file of git('ls-tree', '-r', '-z', '--name-only', revision, '--', prefix)
  .split('\0')
  .filter(Boolean)) {
  sources.set(file.slice(prefix.length), git('show', `${revision}:${file}`));
}

const checkout = await mkdtemp(path.join(tmpdir(), 'sothspell-tiny-notes-tour-'));
try {
  for (const [file, text] of sources) {
    const destination = path.join(checkout, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, text);
  }
  const snapshot = await analyzeProject(checkout);
  const symbolIds = new Set(snapshot.symbols.map((symbol) => symbol.id));

  for (const chapter of document.chapters) {
    for (const beat of chapter.beats) {
      for (const anchor of beat.anchors) {
        const lines = sources.get(anchor.path)?.split('\n');
        if (!lines || anchor.lines.end > lines.length) {
          throw new Error(`anchor ${anchor.id} lies outside the pinned source`);
        }
        if (anchor.symbolId && !symbolIds.has(anchor.symbolId)) {
          throw new Error(`analyzer did not find the target for ${anchor.id}`);
        }
        anchor.excerpt = lines.slice(anchor.lines.start - 1, anchor.lines.end).join('\n');
        anchor.contentHash = hashText(anchor.excerpt);
      }
    }
    for (const diagram of chapter.diagrams) {
      const nodeSymbols = new Map(diagram.nodes.map((node) => [node.id, node.symbolId]));
      for (const edge of diagram.edges) {
        const proven = snapshot.graph.edges.some(
          (relation) =>
            relation.kind === edge.kind &&
            relation.from === nodeSymbols.get(edge.from) &&
            relation.to === nodeSymbols.get(edge.to),
        );
        if (!proven) {
          throw new Error(`analyzer did not verify diagram edge ${edge.id}`);
        }
      }
    }
  }

  await compileSothspell(document);
  const writeJson = (file, value) =>
    writeFile(path.join(output, file), `${JSON.stringify(value, null, 2)}\n`);
  await writeJson('tour.json', document);
  await writeJson(
    'source-hashes.json',
    Object.fromEntries([...sources].map(([file, text]) => [file, hashText(text)])),
  );
} finally {
  await rm(checkout, { recursive: true, force: true });
}
