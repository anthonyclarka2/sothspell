import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileSothspell, parseSothspell } from '@sothspell/core';
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
    roots.push(out);
    const output = capture();

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
  });

  it('requires a model when SOTHSPELL_MODEL is unset', async () => {
    const root = await makeProject();
    const previous = process.env.SOTHSPELL_MODEL;
    delete process.env.SOTHSPELL_MODEL;
    const output = capture();

    try {
      const code = await runCli(['author', root, '--no-cache'], output.io);
      expect(code).toBe(2);
      expect(output.stderr.join('\n')).toMatch(/no model selected/i);
    } finally {
      if (previous !== undefined) {
        process.env.SOTHSPELL_MODEL = previous;
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
