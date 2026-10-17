#!/usr/bin/env node
/**
 * Builds the checked-in golden Bunbun tour from its editable source spec.
 *
 * Why a generator: the narration, anchors, and diagrams are authored by hand,
 * but the excerpts and hashes must come from the pinned Bunbun revision. The
 * generator reads Bunbun read-only and writes only `tour.json` inside this
 * repository, so the demo cannot drift from the code it cites.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const sourcePath = path.join(repoRoot, 'examples', 'bunbun-tour', 'tour.source.json');
const outputPath = path.join(repoRoot, 'examples', 'bunbun-tour', 'tour.json');
const bunbunRoot = process.env.BUNBUN_ROOT ?? '/Users/ajc/Projects/codegens/bunbun';

const LANGUAGE_BY_EXTENSION = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.svelte': 'svelte',
  '.json': 'json',
  '.jsonc': 'jsonc',
  '.md': 'markdown',
  '.mdx': 'mdx',
  '.prisma': 'prisma',
  '.css': 'css',
  '.html': 'html',
  '.sh': 'bash',
  '.sql': 'sql',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

function languageFor(filePath) {
  return LANGUAGE_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? 'plaintext';
}

function hashText(text) {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function readRange(filePath, startLine, endLine, contains) {
  const absolute = path.join(bunbunRoot, filePath);
  const text = readFileSync(absolute, 'utf8');
  const lines = text.split('\n');

  if (endLine > lines.length) {
    throw new Error(
      `${filePath}: range ${startLine}-${endLine} is beyond the file (${lines.length} lines)`,
    );
  }

  const excerpt = lines.slice(startLine - 1, endLine).join('\n');

  if (contains && !excerpt.includes(contains)) {
    throw new Error(
      `${filePath}: range ${startLine}-${endLine} does not contain ${JSON.stringify(contains)}`,
    );
  }

  return excerpt;
}

function main() {
  const spec = JSON.parse(readFileSync(sourcePath, 'utf8'));

  try {
    const revision = execFileSync(
      'git',
      ['-C', bunbunRoot, 'rev-parse', '--short', 'HEAD'],
      { encoding: 'utf8' },
    ).trim();
    const expected = spec.project.revision.commit;
    if (revision !== expected) {
      throw new Error(
        `Bunbun is at ${revision}, but the golden tour is pinned to ${expected}. ` +
          'Check out the pinned commit or update the tour deliberately.',
      );
    }
  } catch (error) {
    if (error instanceof Error && /pinned to/.test(error.message)) {
      throw error;
    }
    throw new Error(`could not read the Bunbun revision at ${bunbunRoot}: ${error}`, {
      cause: error,
    });
  }

  const chapters = spec.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    summary: chapter.summary,
    diagrams: chapter.diagrams.map((diagram) => ({
      id: diagram.id,
      kind: diagram.kind,
      title: diagram.title,
      nodes: diagram.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        type: node.type,
        ...(node.anchorId === undefined ? {} : { anchorId: node.anchorId }),
      })),
      edges: diagram.edges.map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
        ...(edge.label === undefined ? {} : { label: edge.label }),
      })),
    })),
    beats: chapter.beats.map((beat) => ({
      id: beat.id,
      title: beat.title,
      narration: beat.narration,
      ...(beat.durationMs === undefined ? {} : { durationMs: beat.durationMs }),
      anchors: beat.anchors.map((anchor) => {
        const excerpt = readRange(
          anchor.path,
          anchor.lines.start,
          anchor.lines.end,
          anchor.contains,
        );
        return {
          id: anchor.id,
          path: anchor.path,
          ...(anchor.symbol === undefined ? {} : { symbol: anchor.symbol }),
          lines: anchor.lines,
          contentHash: hashText(excerpt),
          ...(anchor.label === undefined ? {} : { label: anchor.label }),
          language: languageFor(anchor.path),
          excerpt,
        };
      }),
      stage: {
        anchorIds: beat.stage.anchorIds,
        ...(beat.stage.diagramId === undefined
          ? {}
          : { diagramId: beat.stage.diagramId }),
        ...(beat.stage.nodeIds === undefined ? {} : { nodeIds: beat.stage.nodeIds }),
        ...(beat.stage.edgeIds === undefined ? {} : { edgeIds: beat.stage.edgeIds }),
      },
      ...(beat.suggestedQuestions === undefined
        ? {}
        : { suggestedQuestions: beat.suggestedQuestions }),
    })),
  }));

  const document = {
    schemaVersion: spec.schemaVersion,
    id: spec.id,
    title: spec.title,
    subtitle: spec.subtitle,
    audience: spec.audience,
    project: spec.project,
    chapters,
  };

  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const beatCount = chapters.reduce((total, chapter) => total + chapter.beats.length, 0);
  const anchorCount = chapters.reduce(
    (total, chapter) =>
      total +
      chapter.beats.reduce((beatTotal, beat) => beatTotal + beat.anchors.length, 0),
    0,
  );

  console.log(
    `Wrote ${outputPath}: ${chapters.length} chapters, ${beatCount} beats, ${anchorCount} anchors, pinned to Bunbun ${spec.project.revision.commit}.`,
  );
}

main();
