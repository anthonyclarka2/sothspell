import os from 'node:os';

/**
 * The sandbox contract for one import. The flags are literal types so a future
 * adapter cannot quietly widen the clone without changing this file and its
 * tests. Limits are the only fields tests override.
 */
export interface ImportPolicy {
  /** Hosts a repository URL may name; everything else is rejected pre-git. */
  readonly allowedHosts: readonly string[];
  /** Ceiling for the finished clone; larger repositories are removed again. */
  readonly maxBytes: number;
  readonly maxFiles: number;
  /** Wall-clock budget for one git invocation. */
  readonly timeoutMs: number;
  readonly depth: 1;
  readonly singleBranch: true;
  readonly fetchTags: false;
  readonly fetchSubmodules: false;
  readonly fetchLfs: false;
  readonly runHooks: false;
}

export interface ImportPolicyOverrides {
  maxBytes?: number;
  maxFiles?: number;
  timeoutMs?: number;
}

export const DEFAULT_IMPORT_POLICY: ImportPolicy = Object.freeze({
  allowedHosts: Object.freeze(['github.com', 'www.github.com']),
  maxBytes: 512 * 1024 * 1024,
  maxFiles: 50_000,
  timeoutMs: 120_000,
  depth: 1,
  singleBranch: true,
  fetchTags: false,
  fetchSubmodules: false,
  fetchLfs: false,
  runHooks: false,
});

export function createImportPolicy(overrides: ImportPolicyOverrides = {}): ImportPolicy {
  return Object.freeze({ ...DEFAULT_IMPORT_POLICY, ...overrides });
}

/**
 * Builds the environment for one git invocation. Inherited `GIT_*` variables
 * are dropped so no provider askpass, SSH command, hooks path, or injected
 * config reaches the clone; only this explicit allowlist is set.
 */
export function createGitEnvironment(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (key.startsWith('GIT_')) {
      continue;
    }
    env[key] = value;
  }
  // Never prompt for credentials: a public clone needs none, and a prompt
  // would hang the timeout instead of failing fast.
  env.GIT_TERMINAL_PROMPT = '0';
  // LFS pointers stay pointers; payloads are never fetched.
  env.GIT_LFS_SKIP_SMUDGE = '1';
  // System and global git config can define hooks, filters, and credentials.
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = os.devNull;
  return env;
}
