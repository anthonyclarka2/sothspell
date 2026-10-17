import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';
import { ImportCloneError, ImportTimeoutError } from './errors.js';
import { createGitEnvironment, createImportPolicy, type ImportPolicy } from './policy.js';
import type { GitRemote } from './types.js';

const execFileAsync = promisify(execFile);

export interface GitRemoteOptions {
  policy?: ImportPolicy;
  /** Alternate git executable; tests point this at a hanging fixture script. */
  gitBinary?: string;
  /** Environment to scrub; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

interface ExecFileFailure {
  killed?: boolean;
  signal?: string | null;
  code?: number | string | null;
  stderr?: string | Buffer;
  message?: string;
}

function mapGitFailure(
  error: unknown,
  label: string,
  timeoutMs: number,
): ImportTimeoutError | ImportCloneError {
  const failure = error as ExecFileFailure;
  if (
    failure.killed === true ||
    failure.signal === 'SIGTERM' ||
    failure.signal === 'SIGKILL' ||
    failure.code === 'ETIMEDOUT'
  ) {
    return new ImportTimeoutError(timeoutMs, label);
  }
  const stderr =
    typeof failure.stderr === 'string'
      ? failure.stderr
      : (failure.stderr?.toString('utf8') ?? '');
  const lastLine = stderr
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .pop();
  return new ImportCloneError(`${label} failed${lastLine ? `: ${lastLine}` : ''}`);
}

/**
 * The real network adapter: every git invocation is `execFile` with a fixed
 * argument array, the policy timeout, and the scrubbed environment. The URL
 * and ref are argv entries, never shell text, so no user input can become a
 * command.
 */
export function createGitRemote(options: GitRemoteOptions = {}): GitRemote {
  const policy = options.policy ?? createImportPolicy();
  const git = options.gitBinary ?? 'git';
  const env = createGitEnvironment(options.env ?? process.env);

  async function run(args: string[], label: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(git, args, {
        env,
        timeout: policy.timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      });
      return stdout;
    } catch (error) {
      throw mapGitFailure(error, label, policy.timeoutMs);
    }
  }

  return {
    async clone({ url, ref, destination }) {
      const args = [
        // Command-line config outranks every config file and keeps the clone
        // inert: no hooks, no credential helpers, no LFS smudge, no submodules.
        // A repository cannot define these itself, because filter commands live
        // in config and `.gitattributes` only references them.
        '-c',
        `core.hooksPath=${os.devNull}`,
        '-c',
        'credential.helper=',
        '-c',
        'submodule.recurse=false',
        '-c',
        'filter.lfs.smudge=',
        '-c',
        'filter.lfs.process=',
        '-c',
        'filter.lfs.required=false',
        'clone',
        '--depth',
        String(policy.depth),
        '--single-branch',
        '--no-tags',
        ...(ref ? ['--branch', ref] : []),
        '--',
        url,
        destination,
      ];
      await run(args, 'git clone');
      const stdout = await run(['-C', destination, 'rev-parse', 'HEAD'], 'git rev-parse');
      return { commit: stdout.trim().slice(0, 64) };
    },
  };
}
