import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  access,
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ImportCloneError,
  ImportLimitError,
  ImportNotFoundError,
  ImportTimeoutError,
  UnsupportedImportHostError,
} from './errors.js';
import { createGitRemote } from './git-remote.js';
import { createImportPolicy, type ImportPolicyOverrides } from './policy.js';
import { createImportService, importedProjectsDirectory } from './service.js';
import {
  createBareGitFixture,
  forceRemoveTree,
  type BareGitFixture,
} from './test-fixtures.js';
import type { GitRemote, ImportService } from './types.js';

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull },
  });
  return stdout.trim();
}

describe('ImportService', () => {
  let fixture: BareGitFixture;
  let home: string;

  beforeEach(async () => {
    fixture = await createBareGitFixture();
    home = await mkdtemp(path.join(os.tmpdir(), 'sothspell-import-home-'));
  });

  afterEach(async () => {
    await fixture.dispose();
    await forceRemoveTree(home);
  });

  /** Wraps the real git adapter so the canonical GitHub URL resolves to the fixture. */
  function serviceFor(
    overrides: { policy?: ImportPolicyOverrides; remote?: GitRemote } = {},
  ): ImportService {
    const policy = createImportPolicy(overrides.policy);
    const base = createGitRemote({ policy });
    const remote =
      overrides.remote ??
      ({
        clone: (input) => base.clone({ ...input, url: fixture.remoteUrl }),
      } satisfies GitRemote);
    return createImportService({ home, policy, remote });
  }

  async function importedRoot(): Promise<string[]> {
    return readdir(importedProjectsDirectory(home)).catch(() => []);
  }

  it('imports a repository and records source, revision, size, and time', async () => {
    const service = serviceFor();
    const { record, created } = await service.import({
      url: 'https://github.com/example/fixture',
    });

    expect(created).toBe(true);
    expect(record.owner).toBe('example');
    expect(record.repo).toBe('fixture');
    expect(record.sourceUrl).toBe('https://github.com/example/fixture');
    expect(record.ref).toBeNull();
    expect(record.commit).toBe(fixture.headCommit);
    expect(record.shortCommit).toBe(fixture.headCommit.slice(0, 12));
    expect(record.id).toBe(`example-fixture-${fixture.headCommit.slice(0, 12)}`);
    expect(record.directory).toBe(path.join(importedProjectsDirectory(home), record.id));
    expect(record.sizeBytes).toBeGreaterThan(0);
    expect(record.fileCount).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(record.importedAt))).toBe(false);

    expect(await readFile(path.join(record.directory, 'README.md'), 'utf8')).toContain(
      'fixture',
    );
    await expect(service.get(record.id)).resolves.toEqual(record);
    await expect(service.list()).resolves.toEqual([record]);
  });

  it('clones shallowly, one branch, and without tags', async () => {
    const service = serviceFor();
    const { record } = await service.import({ url: 'github.com/example/fixture' });

    expect(await git(['rev-list', '--count', 'HEAD'], record.directory)).toBe('1');
    expect(await git(['tag'], record.directory)).toBe('');
    expect(await git(['rev-parse', 'HEAD'], record.directory)).toBe(fixture.headCommit);
    const refs = await git(
      ['for-each-ref', 'refs/remotes', '--format=%(refname)'],
      record.directory,
    );
    expect(refs).not.toContain('feature');
  });

  it('checks out the requested ref and records it', async () => {
    const service = serviceFor();
    const { record } = await service.import({
      url: 'https://github.com/example/fixture',
      ref: 'feature',
    });

    expect(record.ref).toBe('feature');
    expect(record.commit).toBe(fixture.featureCommit);
    expect(await git(['rev-parse', 'HEAD'], record.directory)).toBe(
      fixture.featureCommit,
    );
  });

  it('marks the clone read-only', async () => {
    const service = serviceFor();
    const { record } = await service.import({ url: 'github.com/example/fixture' });

    if (process.platform === 'win32') {
      return;
    }
    await expect(
      access(path.join(record.directory, 'README.md'), constants.W_OK),
    ).rejects.toThrow();
    await expect(access(record.directory, constants.W_OK)).rejects.toThrow();
    await expect(
      readFile(path.join(record.directory, 'README.md'), 'utf8'),
    ).resolves.toContain('fixture');
  });

  it('rejects a repository over the byte ceiling and removes the partial clone', async () => {
    const service = serviceFor({ policy: { maxBytes: 10 } });

    const failure = await service
      .import({ url: 'github.com/example/fixture' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ImportLimitError);
    expect((failure as ImportLimitError).limit).toBe('bytes');
    expect(await importedRoot()).toEqual([]);
  });

  it('rejects a repository over the file ceiling and removes the partial clone', async () => {
    const service = serviceFor({ policy: { maxFiles: 1 } });

    const failure = await service
      .import({ url: 'github.com/example/fixture' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ImportLimitError);
    expect((failure as ImportLimitError).limit).toBe('files');
    expect(await importedRoot()).toEqual([]);
  });

  it('times out a hanging clone and removes the partial clone', async () => {
    const scriptDir = await mkdtemp(path.join(os.tmpdir(), 'sothspell-slow-git-'));
    const script = path.join(scriptDir, 'slow-git.sh');
    await writeFile(script, '#!/bin/sh\nsleep 30\n', 'utf8');
    await chmod(script, 0o755);
    const slow = createGitRemote({
      policy: createImportPolicy({ timeoutMs: 100 }),
      gitBinary: script,
    });
    const service = serviceFor({
      policy: { timeoutMs: 100 },
      remote: { clone: (input) => slow.clone({ ...input, url: fixture.remoteUrl }) },
    });

    const failure = await service
      .import({ url: 'github.com/example/fixture' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ImportTimeoutError);
    expect(await importedRoot()).toEqual([]);
    await rm(scriptDir, { recursive: true, force: true });
  });

  it('reports a failed clone and removes the partial clone', async () => {
    const service = serviceFor({
      remote: {
        clone: (input) =>
          createGitRemote().clone({
            ...input,
            url: 'file:///nonexistent-sothspell/repository.git',
          }),
      },
    });

    const failure = await service
      .import({ url: 'github.com/example/fixture' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ImportCloneError);
    expect(await importedRoot()).toEqual([]);
  });

  it('rejects a non-GitHub URL before git runs', async () => {
    const calls: unknown[] = [];
    const service = createImportService({
      home,
      remote: {
        clone: async (input) => {
          calls.push(input);
          return { commit: fixture.headCommit };
        },
      },
    });

    await expect(
      service.import({ url: 'https://gitlab.com/example/fixture' }),
    ).rejects.toBeInstanceOf(UnsupportedImportHostError);
    expect(calls).toEqual([]);
    expect(existsSync(importedProjectsDirectory(home))).toBe(false);
  });

  it('is idempotent when the same revision is imported twice', async () => {
    const service = serviceFor();
    const first = await service.import({ url: 'github.com/example/fixture' });
    const second = await service.import({ url: 'https://github.com/example/fixture' });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.record).toEqual(first.record);
    expect((await importedRoot()).toSorted()).toEqual(
      [first.record.id, `${first.record.id}.json`].toSorted(),
    );
  });

  it('refreshes without churn when the remote HEAD has not moved', async () => {
    const service = serviceFor();
    const first = await service.import({ url: 'github.com/example/fixture' });

    const refreshed = await service.refresh(first.record.id);

    expect(refreshed.created).toBe(false);
    expect(refreshed.record).toEqual(first.record);
    expect((await importedRoot()).toSorted()).toEqual(
      [first.record.id, `${first.record.id}.json`].toSorted(),
    );
  });

  it('creates a new import on refresh when the remote HEAD moved', async () => {
    const service = serviceFor();
    const first = await service.import({ url: 'github.com/example/fixture' });
    const movedCommit = await fixture.addCommit('third commit');

    const refreshed = await service.refresh(first.record.id);

    expect(refreshed.created).toBe(true);
    expect(refreshed.record.commit).toBe(movedCommit);
    expect(refreshed.record.id).not.toBe(first.record.id);
    expect(refreshed.record.ref).toBe(first.record.ref);
    // The old clone stays pinned so its tours keep their revision.
    expect(existsSync(first.record.directory)).toBe(true);
    await expect(service.get(first.record.id)).resolves.toEqual(first.record);
    expect(await service.list()).toHaveLength(2);
  });

  it('treats refresh of an unknown id as a named error', async () => {
    const service = serviceFor();

    await expect(service.refresh('example-fixture-ffffffffffff')).rejects.toBeInstanceOf(
      ImportNotFoundError,
    );
  });

  it('removes the clone and its record', async () => {
    const service = serviceFor();
    const { record } = await service.import({ url: 'github.com/example/fixture' });

    await expect(service.remove(record.id)).resolves.toBe(true);
    expect(existsSync(record.directory)).toBe(false);
    await expect(service.get(record.id)).resolves.toBeNull();
    await expect(service.list()).resolves.toEqual([]);
    await expect(service.remove(record.id)).resolves.toBe(false);
  });

  it('refuses unsafe ids instead of touching the filesystem', async () => {
    const service = serviceFor();

    await expect(service.get('../secrets')).resolves.toBeNull();
    await expect(service.get('..')).resolves.toBeNull();
    await expect(service.remove('../../etc')).resolves.toBe(false);
    await expect(service.refresh('../secrets')).rejects.toBeInstanceOf(
      ImportNotFoundError,
    );
  });
});
