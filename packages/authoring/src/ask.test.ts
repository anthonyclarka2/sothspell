import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hashText, parseSothspell } from '@sothspell/core';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzeProject } from '@sothspell/analyzer';
import { answerQuestion } from './ask.js';
import { FakeGuideModel } from './fake-model.js';

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-ask-'));
  roots.push(root);
  await mkdir(path.join(root, 'src'), { recursive: true });
  const text = 'export class Service { run(): void {} }\n';
  await writeFile(path.join(root, 'src', 'service.ts'), text);
  const snapshot = await analyzeProject(root);
  const excerpt = text.trimEnd();
  const document = parseSothspell({
    schemaVersion: '1.0.0',
    id: 'tour_ask_fixture',
    title: 'Ask fixture',
    subtitle: 'A fixture for question answering.',
    audience: 'new-contributor',
    project: {
      slug: 'ask-fixture',
      name: 'Ask fixture',
      revision: { commit: 'abcdef1', branch: 'main', dirty: false },
    },
    chapters: [
      {
        id: 'chapter_one',
        title: 'The service',
        summary: 'The service owns one run method.',
        diagrams: [
          {
            id: 'diagram_one',
            kind: 'architecture',
            title: 'One service',
            nodes: [{ id: 'node_service', label: 'Service', type: 'class' }],
            edges: [],
          },
        ],
        beats: [
          {
            id: 'beat_one',
            title: 'The run method',
            narration: 'The service exposes a run method that owns one operation.',
            anchors: [
              {
                id: 'anchor_service',
                path: 'src/service.ts',
                symbol: 'Service',
                lines: { start: 1, end: 1 },
                contentHash: hashText(excerpt),
                label: 'Service',
                excerpt,
              },
            ],
            stage: {
              anchorIds: ['anchor_service'],
              diagramId: 'diagram_one',
              nodeIds: ['node_service'],
            },
          },
        ],
      },
    ],
  });
  return { root, snapshot, document };
}

describe('answerQuestion', () => {
  it('answers with a valid citation and includes the current beat in context', async () => {
    const { root, snapshot, document } = await fixture();
    let prompt = '';
    const model = new FakeGuideModel((request) => {
      prompt = request.prompt;
      return {
        markdown: 'The service owns the run method.',
        citations: ['anchor_service'],
        followUps: ['What calls the service?'],
      };
    });

    const result = await answerQuestion({
      question: 'What does the service do?',
      tour: document,
      beatId: 'beat_one',
      snapshot,
      sourceRoot: root,
      model,
    });

    expect(result.answer.markdown).toContain('service');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.path).toBe('src/service.ts');
    expect(result.warnings).toEqual([]);
    expect(prompt).toContain('The run method');
    expect(prompt).toContain('The service exposes');
  });

  it('drops an unsupported citation and reports it', async () => {
    const { root, snapshot, document } = await fixture();
    const model = new FakeGuideModel(() => ({
      markdown: 'An answer with a bad citation.',
      citations: ['anchor_missing'],
      followUps: [],
    }));

    const result = await answerQuestion({
      question: 'Why?',
      tour: document,
      beatId: 'beat_one',
      snapshot,
      sourceRoot: root,
      model,
    });

    expect(result.citations).toEqual([]);
    expect(result.warnings.join(' ')).toMatch(/unsupported citation/i);
    expect(result.warnings.join(' ')).toMatch(/did not cite a valid anchor/i);
  });

  it('rejects an unknown beat before calling the model', async () => {
    const { root, snapshot, document } = await fixture();
    let called = false;
    const model = new FakeGuideModel(() => {
      called = true;
      return { markdown: '', citations: [], followUps: [] };
    });

    await expect(
      answerQuestion({
        question: 'Why?',
        tour: document,
        beatId: 'missing',
        snapshot,
        sourceRoot: root,
        model,
      }),
    ).rejects.toThrow(/unknown beat/i);
    expect(called).toBe(false);
  });
});
