import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from './cli.js';

const roots: string[] = [];

async function makeProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-cli-'));
  roots.push(root);
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'cli-fixture' }),
  );
  await writeFile(path.join(root, 'src', 'index.ts'), 'export const answer = 42;\n');
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

describe('sothspell CLI', () => {
  it('prints a snapshot as JSON', async () => {
    const root = await makeProject();
    const output = capture();

    const code = await runCli(['analyze', root, '--json', '--no-cache'], output.io);

    expect(code).toBe(0);
    const snapshot = JSON.parse(output.stdout.join('\n')) as {
      id: string;
      project: { slug: string };
    };
    expect(snapshot.id).toMatch(/^snapshot_[a-f0-9]{16}$/);
    expect(snapshot.project.slug).toBe('cli-fixture');
  });

  it('prints a Markdown brief', async () => {
    const root = await makeProject();
    const output = capture();

    const code = await runCli(['analyze', root, '--brief', '--no-cache'], output.io);

    expect(code).toBe(0);
    expect(output.stdout.join('\n')).toContain('# cli-fixture');
    expect(output.stdout.join('\n')).toContain('## Applications');
  });

  it('writes the snapshot to an explicit output path outside the project', async () => {
    const root = await makeProject();
    const out = path.join(root, '..', `snapshot-${path.basename(root)}.json`);
    roots.push(out);
    const output = capture();

    const code = await runCli(['analyze', root, '--out', out, '--no-cache'], output.io);

    expect(code).toBe(0);
    expect(output.stderr).toEqual([]);
  });

  it('refuses to write the snapshot inside the project', async () => {
    const root = await makeProject();
    const output = capture();

    const code = await runCli(
      ['analyze', root, '--out', path.join(root, 'snapshot.json'), '--no-cache'],
      output.io,
    );

    expect(code).toBe(1);
    expect(output.stderr.join('\n')).toMatch(/inside the project/i);
  });

  it('saves a snapshot under SOTHSPELL_HOME', async () => {
    const root = await makeProject();
    const home = await mkdtemp(path.join(tmpdir(), 'sothspell-cli-home-'));
    roots.push(home);
    const previous = process.env.SOTHSPELL_HOME;
    process.env.SOTHSPELL_HOME = home;
    const output = capture();

    try {
      const code = await runCli(['analyze', root, '--save', '--no-cache'], output.io);
      expect(code).toBe(0);
      expect(output.stdout.join('\n')).toContain('Saved');
      expect(
        existsSync(path.join(home, 'projects', 'cli-fixture', 'snapshot.json')),
      ).toBe(true);
      const record = JSON.parse(
        await readFile(
          path.join(home, 'projects', 'cli-fixture', 'project.json'),
          'utf8',
        ),
      ) as { sourceRoot: string; sourceKind: string };
      expect(record.sourceRoot).toBe(await realpath(root));
      expect(record.sourceKind).toBe('local');
    } finally {
      if (previous === undefined) {
        delete process.env.SOTHSPELL_HOME;
      } else {
        process.env.SOTHSPELL_HOME = previous;
      }
    }
  });

  it('returns usage for an unknown command', async () => {
    const output = capture();
    const code = await runCli(['unknown'], output.io);

    expect(code).toBe(2);
    expect(output.stderr.join('\n')).toContain('Usage');
  });
});
