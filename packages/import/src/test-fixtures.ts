import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const COMMIT_IDENTITY = [
  '-c',
  'user.name=Sothspell Test',
  '-c',
  'user.email=test@sothspell.local',
  '-c',
  'commit.gpgsign=false',
];

/** Runs fixture git hermetically: no user config can leak into the test repo. */
async function git(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: os.devNull,
      GIT_TERMINAL_PROMPT: '0',
    },
  });
  return stdout.trim();
}

/**
 * Removes a tree that may contain read-only directories, which `rm` alone
 * cannot unlink from. Mirrors the service's removal path for test teardown.
 */
export async function forceRemoveTree(root: string): Promise<void> {
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop() ?? root;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(full);
      } else if (!entry.isSymbolicLink()) {
        await chmod(full, 0o600).catch(() => undefined);
      }
    }
    await chmod(current, 0o700).catch(() => undefined);
  }
  await rm(root, { recursive: true, force: true });
}

export interface BareGitFixture {
  /** Working tree used to author commits; never cloned directly. */
  workDir: string;
  /** Bare repository that acts as the remote. */
  remoteDir: string;
  /** `file://` URL of the bare repository; the only remote tests touch. */
  remoteUrl: string;
  /** Tip of `main`. */
  headCommit: string;
  /** Tip of `feature`; `main` carries one commit on top of it. */
  featureCommit: string;
  /** Adds and pushes a commit on `main`, returning the new commit SHA. */
  addCommit(message: string): Promise<string>;
  dispose(): Promise<void>;
}

/**
 * Builds a local bare repository so the import tests exercise real git over
 * `file://` without ever touching the network. `main` has two commits and a
 * tag; `feature` points at the first commit.
 */
export async function createBareGitFixture(): Promise<BareGitFixture> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'sothspell-import-fixture-'));
  const workDir = path.join(base, 'work');
  const remoteDir = path.join(base, 'remote.git');
  await mkdir(workDir, { recursive: true });

  await git(['init', '-q', '-b', 'main'], workDir);
  await writeFile(
    path.join(workDir, 'README.md'),
    '# fixture\n\nA tiny repository for import tests.\n',
    'utf8',
  );
  await git([...COMMIT_IDENTITY, 'add', '-A'], workDir);
  await git([...COMMIT_IDENTITY, 'commit', '-q', '-m', 'initial commit'], workDir);
  const featureCommit = await git(['rev-parse', 'HEAD'], workDir);
  await git(['tag', 'v1.0.0'], workDir);
  await git(['branch', 'feature'], workDir);

  await writeFile(path.join(workDir, 'second.txt'), 'second commit\n', 'utf8');
  await git([...COMMIT_IDENTITY, 'add', '-A'], workDir);
  await git([...COMMIT_IDENTITY, 'commit', '-q', '-m', 'second commit'], workDir);
  const headCommit = await git(['rev-parse', 'HEAD'], workDir);

  await git(['init', '-q', '--bare', '-b', 'main', remoteDir]);
  await git(['remote', 'add', 'origin', remoteDir], workDir);
  await git(['push', '-q', 'origin', 'main', 'feature', '--tags'], workDir);

  return {
    workDir,
    remoteDir,
    remoteUrl: pathToFileURL(remoteDir).href,
    headCommit,
    featureCommit,
    async addCommit(message: string): Promise<string> {
      const name = `commit-${Date.now()}.txt`;
      await writeFile(path.join(workDir, name), `${message}\n`, 'utf8');
      await git([...COMMIT_IDENTITY, 'add', '-A'], workDir);
      await git([...COMMIT_IDENTITY, 'commit', '-q', '-m', message], workDir);
      await git(['push', '-q', 'origin', 'main'], workDir);
      return git(['rev-parse', 'HEAD'], workDir);
    },
    async dispose(): Promise<void> {
      await rm(base, { recursive: true, force: true });
    },
  };
}
