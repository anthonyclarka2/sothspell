import { describe, expect, it } from 'vitest';
import { createChildEnvironment } from './env.js';

describe('createChildEnvironment', () => {
  it('keeps base variables and provider prefixes only', () => {
    const env = createChildEnvironment({
      prefixes: ['SOTHSPELL_', 'ANTHROPIC_'],
      source: {
        PATH: '/usr/bin',
        HOME: '/home/user',
        GITHUB_TOKEN: 'ghp_secret',
        OPENCODE_SERVER_PASSWORD: 'hunter2',
        ANTHROPIC_API_KEY: 'sk-ant-test',
        SOTHSPELL_MODEL: 'anthropic/claude',
        AWS_SECRET_ACCESS_KEY: 'aws-secret',
      },
    });

    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/user');
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test');
    expect(env.SOTHSPELL_MODEL).toBe('anthropic/claude');
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.OPENCODE_SERVER_PASSWORD).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it('lets explicit overrides win', () => {
    const env = createChildEnvironment({
      source: { PATH: '/usr/bin', SOTHSPELL_MODEL: 'from-env' },
      extra: { SOTHSPELL_MODEL: 'explicit' },
    });

    expect(env.SOTHSPELL_MODEL).toBe('explicit');
  });
});
