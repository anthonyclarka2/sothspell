#!/usr/bin/env node
/**
 * Builds the demo checkout that the web "Open a repository" flow points at.
 * It copies examples/tiny-notes into SOTHSPELL_HOME and initializes a fresh
 * single-commit git repository, so the flow always has a stable, disposable
 * project to analyze without touching the sothspell working tree.
 */
import { execFile } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'examples', 'tiny-notes');
const home = path.resolve(
  process.env.SOTHSPELL_HOME ?? path.join(os.homedir(), '.sothspell'),
);
const target = path.join(home, 'example-repos', 'tiny-notes');

// The script replaces the target directory, so it must never be able to point
// at a filesystem root or escape the configured home.
if (home === path.parse(home).root) {
  throw new Error('refusing to use the filesystem root as SOTHSPELL_HOME');
}
if (!target.startsWith(`${home}${path.sep}`)) {
  throw new Error('refusing to write outside SOTHSPELL_HOME');
}

// A fixed identity and date keep the demo repository reproducible across
// machines; the commit is a fixture, not authorship.
const commitEnvironment = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Sóþspell Example',
  GIT_AUTHOR_EMAIL: 'example@sothspell.invalid',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_NAME: 'Sóþspell Example',
  GIT_COMMITTER_EMAIL: 'example@sothspell.invalid',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};

const generatedDirectories = new Set(['node_modules', 'dist', '.git', '.tiny-notes']);

await rm(target, { recursive: true, force: true });
await mkdir(path.dirname(target), { recursive: true });
await cp(source, target, {
  recursive: true,
  filter: (entry) => !generatedDirectories.has(path.basename(entry)),
});
await run('git', ['init', '-b', 'main'], { cwd: target, env: commitEnvironment });
await run('git', ['add', '-A'], { cwd: target, env: commitEnvironment });
await run('git', ['commit', '-m', 'Import the tiny-notes example'], {
  cwd: target,
  env: commitEnvironment,
});

console.log(target);
