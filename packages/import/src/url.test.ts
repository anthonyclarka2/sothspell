import { describe, expect, it } from 'vitest';
import {
  InvalidImportUrlError,
  ImportUrlError,
  UnsupportedImportHostError,
  UnsafeImportPathError,
} from './errors.js';
import { parseGitHubUrl } from './url.js';

describe('parseGitHubUrl', () => {
  const accepted: Array<{
    input: string;
    owner: string;
    repo: string;
    ref: string | null;
  }> = [
    { input: 'github.com/example/demo', owner: 'example', repo: 'demo', ref: null },
    { input: 'example/demo', owner: 'example', repo: 'demo', ref: null },
    {
      input: 'https://github.com/example/demo',
      owner: 'example',
      repo: 'demo',
      ref: null,
    },
    {
      input: 'https://github.com/example/demo.git',
      owner: 'example',
      repo: 'demo',
      ref: null,
    },
    {
      input: 'http://github.com/example/demo',
      owner: 'example',
      repo: 'demo',
      ref: null,
    },
    {
      input: 'https://www.github.com/example/demo',
      owner: 'example',
      repo: 'demo',
      ref: null,
    },
    {
      input: 'git@github.com:example/demo.git',
      owner: 'example',
      repo: 'demo',
      ref: null,
    },
    {
      input: 'ssh://git@github.com/example/demo.git',
      owner: 'example',
      repo: 'demo',
      ref: null,
    },
    {
      input: 'https://GitHub.com/Example/Demo/',
      owner: 'Example',
      repo: 'Demo',
      ref: null,
    },
    {
      input: 'https://github.com/example/demo?tab=readme',
      owner: 'example',
      repo: 'demo',
      ref: null,
    },
    {
      input: 'https://github.com/example/demo#readme',
      owner: 'example',
      repo: 'demo',
      ref: null,
    },
    {
      input: 'https://github.com/example/demo/tree/main',
      owner: 'example',
      repo: 'demo',
      ref: 'main',
    },
    {
      input: 'https://github.com/example/demo/tree/feature/nested-name',
      owner: 'example',
      repo: 'demo',
      ref: 'feature/nested-name',
    },
    {
      input: 'https://github.com/example/demo/tree/release%2Fv2',
      owner: 'example',
      repo: 'demo',
      ref: 'release/v2',
    },
    {
      input: 'github.com/my-org_1/my.repo-name',
      owner: 'my-org_1',
      repo: 'my.repo-name',
      ref: null,
    },
  ];

  for (const { input, owner, repo, ref } of accepted) {
    it(`parses ${input}`, () => {
      const parsed = parseGitHubUrl(input);

      expect(parsed.owner).toBe(owner);
      expect(parsed.repo).toBe(repo);
      expect(parsed.ref).toBe(ref);
      expect(parsed.canonicalUrl).toBe(`https://github.com/${owner}/${repo}.git`);
    });
  }

  it('rejects non-GitHub hosts by name', () => {
    for (const input of [
      'https://gitlab.com/example/demo',
      'gitlab.com/example/demo',
      'bitbucket.org/example/demo',
      'https://github.com.evil.example/example/demo',
      'https://evil.example/github.com/example/demo',
      'https://raw.githubusercontent.com/example/demo',
    ]) {
      expect(() => parseGitHubUrl(input), input).toThrowError(UnsupportedImportHostError);
    }
  });

  it('rejects malformed input by name', () => {
    for (const input of [
      '',
      '   ',
      'https://github.com',
      'https://github.com/example',
      'github.com/example',
      'github.com/example/demo/blob/main/file.ts',
      'https://github.com/example/demo/tree',
      'not a repository url',
      'ftp://github.com/example/demo',
      'https://github.com/example/demo/extra',
    ]) {
      expect(() => parseGitHubUrl(input), input).toThrowError(InvalidImportUrlError);
    }
  });

  it('rejects path traversal in owner and repository names', () => {
    for (const input of [
      'github.com/../demo',
      'github.com/example/..',
      'github.com/..%2Fdemo',
      'github.com/example/%2e%2e',
      'github.com/a..b/demo',
      'github.com/example/..%2Fetc',
      'https://github.com/example/demo/tree/-force',
      'https://github.com/example/demo/tree/..%2fescape',
    ]) {
      expect(() => parseGitHubUrl(input), input).toThrowError(ImportUrlError);
    }
  });

  it('rejects an owner or repository name that is not a GitHub name', () => {
    expect(() => parseGitHubUrl('github.com/exa mple/demo')).toThrowError(
      UnsafeImportPathError,
    );
    expect(() => parseGitHubUrl('github.com/-leading/demo')).toThrowError(
      UnsafeImportPathError,
    );
    expect(() => parseGitHubUrl('github.com/example/.git')).toThrowError(
      UnsafeImportPathError,
    );
  });
});
