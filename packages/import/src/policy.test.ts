import os from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMPORT_POLICY,
  createGitEnvironment,
  createImportPolicy,
} from './policy.js';

describe('import policy', () => {
  it('locks the clone to depth one, a single branch, and no tags or hooks', () => {
    const policy = createImportPolicy();

    expect(policy.depth).toBe(1);
    expect(policy.singleBranch).toBe(true);
    expect(policy.fetchTags).toBe(false);
    expect(policy.fetchSubmodules).toBe(false);
    expect(policy.fetchLfs).toBe(false);
    expect(policy.runHooks).toBe(false);
    expect(policy.allowedHosts).toContain('github.com');
    expect(policy.maxBytes).toBeGreaterThan(0);
    expect(policy.maxFiles).toBeGreaterThan(0);
    expect(policy.timeoutMs).toBeGreaterThan(0);
  });

  it('applies limit overrides without changing the sandbox flags', () => {
    const policy = createImportPolicy({ maxBytes: 10, maxFiles: 2, timeoutMs: 50 });

    expect(policy.maxBytes).toBe(10);
    expect(policy.maxFiles).toBe(2);
    expect(policy.timeoutMs).toBe(50);
    expect(policy.depth).toBe(1);
    expect(DEFAULT_IMPORT_POLICY.maxBytes).not.toBe(10);
  });

  it('scrubs every GIT_* variable and adds safe defaults', () => {
    const env = createGitEnvironment({
      PATH: '/usr/bin',
      HOME: '/home/example',
      GIT_DIR: '/tmp/elsewhere',
      GIT_ASKPASS: '/tmp/evil-askpass',
      GIT_SSH_COMMAND: 'ssh -o ProxyCommand=evil',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/tmp/evil-hooks',
    });

    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/example');
    expect(env.GIT_DIR).toBeUndefined();
    expect(env.GIT_ASKPASS).toBeUndefined();
    expect(env.GIT_SSH_COMMAND).toBeUndefined();
    expect(env.GIT_CONFIG_COUNT).toBeUndefined();
    for (const key of Object.keys(env)) {
      if (key.startsWith('GIT_')) {
        expect([
          'GIT_TERMINAL_PROMPT',
          'GIT_LFS_SKIP_SMUDGE',
          'GIT_CONFIG_NOSYSTEM',
          'GIT_CONFIG_GLOBAL',
        ]).toContain(key);
      }
    }
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(env.GIT_LFS_SKIP_SMUDGE).toBe('1');
    expect(env.GIT_CONFIG_NOSYSTEM).toBe('1');
    expect(env.GIT_CONFIG_GLOBAL).toBe(os.devNull);
  });
});
