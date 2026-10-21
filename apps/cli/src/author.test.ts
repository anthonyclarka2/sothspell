import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileSothspell, parseSothspell } from '@sothspell/core';
import { createSettingsService } from '@sothspell/settings';
import { runCli } from './cli.js';

const roots: string[] = [];

async function makeProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-author-cli-'));
  roots.push(root);
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'author-cli-fixture' }),
  );
  await writeFile(
    path.join(root, 'src', 'service.ts'),
    [
      'export class Service {',
      '  run(): void {}',
      '}',
      'export function bootstrap(): void {}',
    ].join('\n'),
  );
  await writeFile(
    path.join(root, 'src', 'store.ts'),
    'export class Store { save(): void {} }\n',
  );
  return root;
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

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('sothspell author CLI', () => {
  it('writes a compilable tour with the fixture model', async () => {
    const root = await makeProject();
    const out = await mkdtemp(path.join(tmpdir(), 'sothspell-author-out-'));
    const home = await mkdtemp(path.join(tmpdir(), 'sothspell-author-home-'));
    roots.push(out, home);
    const previousHome = process.env.SOTHSPELL_HOME;
    process.env.SOTHSPELL_HOME = home;
    const output = capture();

    try {
      const code = await runCli(
        ['author', root, '--model', 'fixture', '--out', out, '--no-cache'],
        output.io,
      );

      expect(code).toBe(0);
      const document = parseSothspell(
        JSON.parse(await readFile(path.join(out, 'tour.json'), 'utf8')) as unknown,
      );
      const compiled = await compileSothspell(document);

      expect(compiled.chapters.length).toBeGreaterThanOrEqual(3);
      expect(compiled.chapters[0]?.beats[0]?.anchors[0]?.html).toContain('shiki');
      expect(output.stdout.join('\n')).toContain('Wrote');

      const projectDirectory = path.join(home, 'projects', 'author-cli-fixture');
      const record = JSON.parse(
        await readFile(path.join(projectDirectory, 'project.json'), 'utf8'),
      ) as { sourceRoot: string; sourceKind: string };
      expect(record.sourceRoot).toBe(await realpath(root));
      expect(record.sourceKind).toBe('local');
      expect(existsSync(path.join(projectDirectory, 'snapshot.json'))).toBe(true);
      expect(await readFile(path.join(out, 'tour.json'), 'utf8')).not.toContain(root);
    } finally {
      if (previousHome === undefined) {
        delete process.env.SOTHSPELL_HOME;
      } else {
        process.env.SOTHSPELL_HOME = previousHome;
      }
    }
  });

  it('requires a model when SOTHSPELL_MODEL is unset and no profile is active', async () => {
    const root = await makeProject();
    const home = await mkdtemp(path.join(tmpdir(), 'sothspell-author-home-'));
    roots.push(home);
    const previous = process.env.SOTHSPELL_MODEL;
    delete process.env.SOTHSPELL_MODEL;
    const output = capture();

    try {
      const code = await runCli(['author', root, '--no-cache'], output.io, {
        settings: createSettingsService({ homeDirectory: home }),
      });
      expect(code).toBe(2);
      expect(output.stderr.join('\n')).toMatch(/no model selected/i);
    } finally {
      if (previous !== undefined) {
        process.env.SOTHSPELL_MODEL = previous;
      }
    }
  });

  it('authors through the settings resolver when SOTHSPELL_MODEL is set', async () => {
    const root = await makeProject();
    const out = await mkdtemp(path.join(tmpdir(), 'sothspell-author-out-'));
    const home = await mkdtemp(path.join(tmpdir(), 'sothspell-author-home-'));
    roots.push(out, home);
    const previous = process.env.SOTHSPELL_MODEL;
    const previousHome = process.env.SOTHSPELL_HOME;
    process.env.SOTHSPELL_MODEL = 'fixture';
    process.env.SOTHSPELL_HOME = home;
    const output = capture();

    try {
      const code = await runCli(['author', root, '--out', out, '--no-cache'], output.io, {
        settings: createSettingsService({ homeDirectory: home }),
      });
      expect(code).toBe(0);
      const quality = JSON.parse(
        await readFile(path.join(out, 'quality.json'), 'utf8'),
      ) as { modelId: string; profileName?: string };
      expect(quality.modelId).toBe('fixture');
      expect(quality.profileName).toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env.SOTHSPELL_MODEL;
      } else {
        process.env.SOTHSPELL_MODEL = previous;
      }
      if (previousHome === undefined) {
        delete process.env.SOTHSPELL_HOME;
      } else {
        process.env.SOTHSPELL_HOME = previousHome;
      }
    }
  });

  it('writes a tour file and a sibling quality file when --out is a file', async () => {
    const root = await makeProject();
    const out = await mkdtemp(path.join(tmpdir(), 'sothspell-author-out-'));
    const home = await mkdtemp(path.join(tmpdir(), 'sothspell-author-home-'));
    roots.push(out, home);
    const previousHome = process.env.SOTHSPELL_HOME;
    process.env.SOTHSPELL_HOME = home;
    const output = capture();
    const destination = path.join(out, 'custom-tour.json');

    try {
      const code = await runCli(
        ['author', root, '--model', 'fixture', '--out', destination, '--no-cache'],
        output.io,
      );

      expect(code).toBe(0);
      const document = parseSothspell(
        JSON.parse(await readFile(destination, 'utf8')) as unknown,
      );
      expect(document.id.length).toBeGreaterThan(0);
      expect(existsSync(path.join(out, 'custom-tour-quality.json'))).toBe(true);
      expect(
        existsSync(path.join(home, 'projects', 'author-cli-fixture', 'project.json')),
      ).toBe(true);
    } finally {
      if (previousHome === undefined) {
        delete process.env.SOTHSPELL_HOME;
      } else {
        process.env.SOTHSPELL_HOME = previousHome;
      }
    }
  });

  it('refuses to write the tour inside the project', async () => {
    const root = await makeProject();
    const output = capture();

    const code = await runCli(
      [
        'author',
        root,
        '--model',
        'fixture',
        '--out',
        path.join(root, 'tour-out'),
        '--no-cache',
      ],
      output.io,
    );

    expect(code).toBe(1);
    expect(output.stderr.join('\n')).toMatch(/inside the project/i);
  });
});
