import { execFile } from 'node:child_process';
import { chmod, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImportCloneError, ImportTimeoutError } from './errors.js';
import { createGitRemote } from './git-remote.js';
import { createImportPolicy } from './policy.js';
import { createBareGitFixture, type BareGitFixture } from './test-fixtures.js';

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull },
  });
  return stdout.trim();
}

describe('GitRemote', () => {
  let fixture: BareGitFixture;
  let scratch: string;

  beforeEach(async () => {
    fixture = await createBareGitFixture();
    scratch = await mkdtemp(path.join(os.tmpdir(), 'sothspell-import-clone-'));
  });

  afterEach(async () => {
    await fixture.dispose();
    await rm(scratch, { recursive: true, force: true });
  });

  it('clones shallowly, without tags, and returns the resolved commit', async () => {
    const remote = createGitRemote();
    const destination = path.join(scratch, 'demo');

    const { commit } = await remote.clone({
      url: fixture.remoteUrl,
      destination,
    });

    expect(commit).toBe(fixture.headCommit);
    expect(await git(['rev-list', '--count', 'HEAD'], destination)).toBe('1');
    expect(await git(['tag'], destination)).toBe('');
    expect(existsSync(path.join(destination, '.git', 'shallow'))).toBe(true);
    const remoteRefs = await git(
      ['for-each-ref', 'refs/remotes', '--format=%(refname)'],
      destination,
    );
    expect(remoteRefs.split('\n')).toContain('refs/remotes/origin/main');
    expect(remoteRefs).not.toContain('feature');
  });

  it('checks out the requested ref', async () => {
    const remote = createGitRemote();
    const destination = path.join(scratch, 'feature-clone');

    const { commit } = await remote.clone({
      url: fixture.remoteUrl,
      ref: 'feature',
      destination,
    });

    expect(commit).toBe(fixture.featureCommit);
    expect(await git(['rev-parse', 'HEAD'], destination)).toBe(fixture.featureCommit);
    expect(await git(['rev-list', '--count', 'HEAD'], destination)).toBe('1');
  });

  it('scrubs inherited GIT_* variables before running git', async () => {
    const remote = createGitRemote({
      env: {
        ...process.env,
        GIT_DIR: '/nonexistent-sothspell-git-dir',
        GIT_WORK_TREE: '/nonexistent-sothspell-work-tree',
        GIT_ASKPASS: '/nonexistent-sothspell-askpass',
        GIT_SSH_COMMAND: 'ssh -o ProxyCommand=/nonexistent',
      },
    });
    const destination = path.join(scratch, 'scrubbed');

    const { commit } = await remote.clone({ url: fixture.remoteUrl, destination });

    expect(commit).toBe(fixture.headCommit);
  });

  it('times out a hanging git process', async () => {
    const scriptDir = await mkdtemp(path.join(os.tmpdir(), 'sothspell-slow-git-'));
    const script = path.join(scriptDir, 'slow-git.sh');
    await writeFile(script, '#!/bin/sh\nsleep 30\n', 'utf8');
    await chmod(script, 0o755);
    const remote = createGitRemote({
      policy: createImportPolicy({ timeoutMs: 100 }),
      gitBinary: script,
    });

    const failure = await remote
      .clone({ url: fixture.remoteUrl, destination: path.join(scratch, 'slow') })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ImportTimeoutError);
    expect((failure as ImportTimeoutError).timeoutMs).toBe(100);
    await rm(scriptDir, { recursive: true, force: true });
  });

  it('reports a clone failure as a named error', async () => {
    const remote = createGitRemote();

    const failure = await remote
      .clone({
        url: 'file:///nonexistent-sothspell/repository.git',
        destination: path.join(scratch, 'missing'),
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ImportCloneError);
    expect((failure as Error).message).toContain('git clone failed');
    expect(await stat(scratch)).toBeTruthy();
  });
});
