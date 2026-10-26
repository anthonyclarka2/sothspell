import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  hashText,
  parseSothspell,
  SCHEMA_VERSION,
  type SothspellDocument,
} from '@sothspell/core';
import { FakeGuideModel, createFixtureTranslationModel } from '@sothspell/authoring';
import { createSettingsService } from '@sothspell/settings';
import { runCli } from './cli.js';
import { parseTranslateArgs, runTranslate } from './translate.js';

const EXCERPT = 'export function readSourceRange(path) {\n  return path;\n}';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function fixtureTour(): unknown {
  return {
    schemaVersion: '1.0.0',
    id: 'tour_cli_fixture',
    title: 'A CLI fixture',
    subtitle: 'One beat used to exercise sothspell translate',
    audience: 'new-contributor',
    project: {
      slug: 'fixture',
      name: 'Fixture',
      revision: { commit: 'abc1234', branch: 'main', dirty: false },
    },
    chapters: [
      {
        id: 'chapter_one',
        title: 'Reading evidence',
        summary: 'One chapter about reading source evidence safely.',
        diagrams: [
          {
            id: 'diagram_one',
            kind: 'architecture',
            title: 'Reader',
            nodes: [{ id: 'node_reader', label: 'Reader', type: 'function' }],
            edges: [],
          },
        ],
        beats: [
          {
            id: 'beat_one',
            title: 'The reader',
            narration:
              'The reader is readSourceRange, and it lives in src/reader.ts. It reads the requested lines without touching anything else in the project.',
            anchors: [
              {
                id: 'anchor_reader',
                path: 'src/reader.ts',
                symbol: 'readSourceRange',
                lines: { start: 1, end: 3 },
                contentHash: hashText(EXCERPT),
                excerpt: EXCERPT,
              },
            ],
            stage: {
              anchorIds: ['anchor_reader'],
              diagramId: 'diagram_one',
              nodeIds: ['node_reader'],
            },
          },
        ],
      },
    ],
  };
}

async function makeTourFile(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-cli-translate-'));
  roots.push(root);
  const tourPath = path.join(root, 'tour.json');
  await writeFile(tourPath, JSON.stringify(fixtureTour(), null, 2), 'utf8');
  return tourPath;
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (line: string) => stdout.push(line),
      stderr: (line: string) => stderr.push(line),
    },
  };
}

describe('parseTranslateArgs', () => {
  it('requires a tour path and a locale', () => {
    expect(() => parseTranslateArgs([])).toThrow(/tour JSON path/);
    expect(() => parseTranslateArgs(['tour.json'])).toThrow(/--locale/);
    expect(() => parseTranslateArgs(['tour.json', '--locale', 'nope!'])).toThrow(
      /locale/,
    );
    expect(() => parseTranslateArgs(['tour.json', '--locale', 'es', '--wat'])).toThrow(
      /unknown option/,
    );
  });

  it('parses locale, out, and model', () => {
    expect(
      parseTranslateArgs([
        'tour.json',
        '--locale',
        'ar',
        '--out',
        'out.json',
        '--model',
        'fixture',
      ]),
    ).toEqual({
      tourPath: 'tour.json',
      locale: 'ar',
      out: 'out.json',
      model: 'fixture',
    });
  });
});

describe('runTranslate', () => {
  it('writes a translated tour beside the source by default', async () => {
    const tourPath = await makeTourFile();
    const output = capture();

    const code = await runTranslate(
      { tourPath, locale: 'es', out: null, model: null },
      output.io,
      { model: createFixtureTranslationModel('es') },
    );

    expect(code).toBe(0);
    const outPath = path.join(path.dirname(tourPath), 'tour.es.json');
    expect(existsSync(outPath)).toBe(true);
    expect(output.stdout.join('\n')).toContain(`Wrote ${outPath}`);

    const document = parseSothspell(
      JSON.parse(await readFile(outPath, 'utf8')) as unknown,
    ) as SothspellDocument;
    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
    expect(document.locale).toBe('en');
    expect(document.translations?.es?.locale).toBe('es');
    expect(document.translations?.es?.chapters[0]?.beats[0]?.id).toBe('beat_one');
    expect(document.translations?.es?.chapters[0]?.beats[0]?.narration).toContain(
      'readSourceRange',
    );
    expect(document.chapters[0]?.beats[0]?.anchors[0]?.contentHash).toBe(
      hashText(EXCERPT),
    );
  });

  it('honors an explicit output file', async () => {
    const tourPath = await makeTourFile();
    const outPath = path.join(path.dirname(tourPath), 'translated.json');
    const output = capture();

    const code = await runTranslate(
      { tourPath, locale: 'ar', out: outPath, model: null },
      output.io,
      { model: createFixtureTranslationModel('ar') },
    );

    expect(code).toBe(0);
    const document = parseSothspell(
      JSON.parse(await readFile(outPath, 'utf8')) as unknown,
    );
    expect(document.translations?.ar?.locale).toBe('ar');
  });

  it('fails with issues when the model output cannot be validated', async () => {
    const tourPath = await makeTourFile();
    const output = capture();
    const broken = new FakeGuideModel(() => ({}), 'broken');

    const code = await runTranslate(
      { tourPath, locale: 'es', out: null, model: null },
      output.io,
      { model: broken },
    );

    expect(code).toBe(1);
    expect(output.stderr.join('\n')).toContain('Error:');
    expect(output.stderr.join('\n')).toContain('Issue:');
  });

  it('refuses to translate a tour into its own source locale', async () => {
    const tourPath = await makeTourFile();
    const output = capture();

    const code = await runTranslate(
      { tourPath, locale: 'en', out: null, model: null },
      output.io,
      { model: createFixtureTranslationModel('en') },
    );

    expect(code).toBe(1);
    expect(output.stderr.join('\n')).toContain('already in en');
  });

  it('is reachable through the CLI with an injected model', async () => {
    const tourPath = await makeTourFile();
    const output = capture();

    const code = await runCli(['translate', tourPath, '--locale', 'es'], output.io, {
      translateModel: createFixtureTranslationModel('es'),
    });

    expect(code).toBe(0);
    expect(existsSync(path.join(path.dirname(tourPath), 'tour.es.json'))).toBe(true);
  });

  it('reports a usage error without a model', async () => {
    const tourPath = await makeTourFile();
    const home = await mkdtemp(path.join(tmpdir(), 'sothspell-cli-translate-home-'));
    roots.push(home);
    const previous = process.env.SOTHSPELL_MODEL;
    delete process.env.SOTHSPELL_MODEL;
    const output = capture();

    try {
      const code = await runCli(['translate', tourPath, '--locale', 'es'], output.io, {
        settings: createSettingsService({ homeDirectory: home }),
      });

      expect(code).toBe(2);
      expect(output.stderr.join('\n')).toMatch(/no model selected/);
    } finally {
      if (previous !== undefined) {
        process.env.SOTHSPELL_MODEL = previous;
      }
    }
  });
});
