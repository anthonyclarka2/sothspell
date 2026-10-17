import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashText, parseSothspell, type SothspellDocument } from '@sothspell/core';

/**
 * Shared fixtures for the review tests: one small but schema-valid tour with
 * three anchors across three files, and a writer that materialises the exact
 * source the anchors were hashed from.
 */

export const README_LINES = [
  '# Fixture project',
  '',
  'A tiny project used by the review tests.',
  '',
  '## Layout',
  '',
  '- apps/api',
  '- apps/web',
];

export const MAIN_LINES = [
  'export function bootstrap() {',
  '  return "ready";',
  '}',
  '',
  'export function shutdown() {',
  '  return "stopped";',
  '}',
];

export const CONTEXT_LINES = [
  '# Fixture context',
  '',
  'The glossary the fixture tour cites.',
];

export const SOURCE_FILES: Record<string, string[]> = {
  'README.md': README_LINES,
  'src/main.ts': MAIN_LINES,
  'CONTEXT.md': CONTEXT_LINES,
};

function excerptOf(file: string, startLine: number, endLine: number): string {
  const lines = SOURCE_FILES[file] ?? [];
  return lines.slice(startLine - 1, endLine).join('\n');
}

export const NARRATION_ONE =
  'The fixture opens with the README overview. It names the project, states what the project is for, and gives the reader a first concrete place to stand. The excerpt is short on purpose so a test can hash it exactly and a reviewer can read it in one glance. The narration continues until the beat has enough words to satisfy the authoring bound for generated narration, which keeps regeneration tests honest.';

export const NARRATION_TWO =
  'The second beat points at the entry point instead of the documentation. The excerpt shows two exported functions and the boundary between them, which is the smallest interesting unit a tour can explain without guessing at behavior. A reviewer can read this narration, compare it with the excerpt, and decide whether the claim matches the evidence in front of them.';

export const NARRATION_THREE =
  'The third beat sits in a second chapter so the fixture can prove chapter-scoped validation. It cites the glossary file, which is a different shape of evidence from the code excerpt, and it focuses a diagram from its own chapter rather than reusing the first one. The narration is long enough to be regenerated and short enough to stay readable in a test failure message.';

export function makeReviewDocument(): SothspellDocument {
  return parseSothspell({
    schemaVersion: '1.0.0',
    id: 'tour_fixture_review',
    title: 'Fixture review tour',
    subtitle: 'A small tour used by the review tests',
    audience: 'new-contributor',
    project: {
      slug: 'fixture',
      name: 'Fixture',
      revision: { commit: 'abc1234', branch: 'main', dirty: false },
    },
    chapters: [
      {
        id: 'chapter_one',
        title: 'The shape of the project',
        summary: 'The overview and the entry point, read together.',
        diagrams: [
          {
            id: 'diagram_one',
            kind: 'architecture',
            title: 'Overview to entry point',
            nodes: [
              { id: 'n_source', label: 'README', type: 'file' },
              { id: 'n_target', label: 'Entry point', type: 'module' },
            ],
            edges: [{ id: 'e_flow', from: 'n_source', to: 'n_target', kind: 'depends' }],
          },
        ],
        beats: [
          {
            id: 'beat_one',
            title: 'The overview',
            narration: NARRATION_ONE,
            anchors: [
              {
                id: 'anchor_readme',
                path: 'README.md',
                lines: { start: 1, end: 3 },
                contentHash: hashText(excerptOf('README.md', 1, 3)),
                label: 'Fixture project',
                language: 'markdown',
                excerpt: excerptOf('README.md', 1, 3),
              },
            ],
            stage: {
              anchorIds: ['anchor_readme'],
              diagramId: 'diagram_one',
              nodeIds: ['n_source'],
              edgeIds: ['e_flow'],
            },
            suggestedQuestions: ['What does the project do?'],
          },
          {
            id: 'beat_two',
            title: 'The entry point',
            narration: NARRATION_TWO,
            anchors: [
              {
                id: 'anchor_main',
                path: 'src/main.ts',
                symbol: 'bootstrap',
                lines: { start: 1, end: 3 },
                contentHash: hashText(excerptOf('src/main.ts', 1, 3)),
                label: 'bootstrap()',
                language: 'typescript',
                excerpt: excerptOf('src/main.ts', 1, 3),
              },
            ],
            stage: {
              anchorIds: ['anchor_main'],
              diagramId: 'diagram_one',
              nodeIds: ['n_target'],
              edgeIds: [],
            },
          },
        ],
      },
      {
        id: 'chapter_two',
        title: 'The shared language',
        summary: 'The glossary the tour leans on.',
        diagrams: [
          {
            id: 'diagram_two',
            kind: 'tree',
            title: 'Glossary',
            nodes: [{ id: 'm_one', label: 'Context', type: 'file' }],
            edges: [],
          },
        ],
        beats: [
          {
            id: 'beat_three',
            title: 'The glossary',
            narration: NARRATION_THREE,
            anchors: [
              {
                id: 'anchor_context',
                path: 'CONTEXT.md',
                lines: { start: 1, end: 2 },
                contentHash: hashText(excerptOf('CONTEXT.md', 1, 2)),
                label: 'Fixture context',
                language: 'markdown',
                excerpt: excerptOf('CONTEXT.md', 1, 2),
              },
            ],
            stage: {
              anchorIds: ['anchor_context'],
              diagramId: 'diagram_two',
              nodeIds: ['m_one'],
              edgeIds: [],
            },
          },
        ],
      },
    ],
  });
}

/** Writes the fixture source files; `overrides` makes an anchor stale. */
export async function writeFixtureSource(
  root: string,
  overrides: Record<string, string[]> = {},
): Promise<void> {
  for (const [file, lines] of Object.entries({ ...SOURCE_FILES, ...overrides })) {
    const absolute = path.join(root, file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, `${lines.join('\n')}\n`, 'utf8');
  }
}
