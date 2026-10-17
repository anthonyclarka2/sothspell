import { describe, expect, it } from 'vitest';
import {
  ImportTimeoutError,
  type ImportRecord,
  type ImportService,
} from '@sothspell/import';
import { runCli } from './cli.js';
import { parseImportArgs, runImport } from './import.js';

function sampleRecord(overrides: Partial<ImportRecord> = {}): ImportRecord {
  const commit = '0123456789abcdef0123456789abcdef01234567';
  return {
    id: 'example-demo-0123456789ab',
    owner: 'example',
    repo: 'demo',
    sourceUrl: 'https://github.com/example/demo',
    ref: null,
    commit,
    shortCommit: commit.slice(0, 12),
    directory: '/tmp/sothspell/projects/imported/example-demo-0123456789ab',
    sizeBytes: 2_097_152,
    fileCount: 128,
    importedAt: '2026-10-17T00:00:00.000Z',
    ...overrides,
  };
}

function fakeService(overrides: Partial<ImportService> = {}): ImportService {
  const record = sampleRecord();
  return {
    import: async () => ({ record, created: true }),
    list: async () => [record],
    get: async () => record,
    refresh: async () => ({ record, created: false }),
    remove: async () => true,
    ...overrides,
  };
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

describe('parseImportArgs', () => {
  it('accepts a URL with an optional ref and JSON flag', () => {
    expect(parseImportArgs(['github.com/example/demo'])).toEqual({
      url: 'github.com/example/demo',
      ref: null,
      json: false,
    });
    expect(
      parseImportArgs([
        'https://github.com/example/demo',
        '--ref',
        'feature/x',
        '--json',
      ]),
    ).toEqual({
      url: 'https://github.com/example/demo',
      ref: 'feature/x',
      json: true,
    });
  });

  it('rejects a missing URL, a dangling ref, and unknown options', () => {
    expect(() => parseImportArgs([])).toThrowError(/needs a GitHub repository URL/u);
    expect(() => parseImportArgs(['github.com/example/demo', '--ref'])).toThrowError(
      /--ref needs/u,
    );
    expect(() => parseImportArgs(['github.com/example/demo', '--bogus'])).toThrowError(
      /unknown option/u,
    );
  });
});

describe('runImport', () => {
  it('prints the imported project and exits zero', async () => {
    const output = capture();

    const code = await runImport(
      { url: 'github.com/example/demo', ref: 'main', json: false },
      output.io,
      {
        service: fakeService({
          import: async () => ({ record: sampleRecord({ ref: 'main' }), created: true }),
        }),
      },
    );

    expect(code).toBe(0);
    const stdout = output.stdout.join('\n');
    expect(stdout).toContain('Imported example/demo@0123456789ab');
    expect(stdout).toContain(
      'Path: /tmp/sothspell/projects/imported/example-demo-0123456789ab',
    );
    expect(stdout).toContain('Size: 2.0 MB (128 files)');
    expect(output.stderr).toEqual([]);
  });

  it('prints JSON when asked', async () => {
    const output = capture();

    const code = await runImport(
      { url: 'github.com/example/demo', ref: null, json: true },
      output.io,
      { service: fakeService() },
    );

    expect(code).toBe(0);
    const parsed = JSON.parse(output.stdout.join('\n')) as {
      import: ImportRecord;
      created: boolean;
    };
    expect(parsed.import.id).toBe('example-demo-0123456789ab');
    expect(parsed.created).toBe(true);
  });

  it('reports an already imported revision without failing', async () => {
    const output = capture();

    const code = await runImport(
      { url: 'github.com/example/demo', ref: null, json: false },
      output.io,
      {
        service: fakeService({
          import: async () => ({ record: sampleRecord(), created: false }),
        }),
      },
    );

    expect(code).toBe(0);
    expect(output.stdout.join('\n')).toContain(
      'Already imported: example-demo-0123456789ab',
    );
  });

  it('exits one with the named error message when the import fails', async () => {
    const output = capture();

    const code = await runImport(
      { url: 'github.com/example/demo', ref: null, json: false },
      output.io,
      {
        service: fakeService({
          import: async () => {
            throw new ImportTimeoutError(120_000);
          },
        }),
      },
    );

    expect(code).toBe(1);
    expect(output.stderr.join('\n')).toContain('timed out after 120000 ms');
  });
});

describe('runCli import dispatch', () => {
  it('rejects a non-GitHub URL before touching the network', async () => {
    const output = capture();

    const code = await runCli(['import', 'https://gitlab.com/example/demo'], output.io);

    expect(code).toBe(1);
    expect(output.stderr.join('\n')).toContain('only public GitHub repositories');
  });

  it('rejects a missing URL and unknown options with the usage exit code', async () => {
    const missing = capture();
    expect(await runCli(['import'], missing.io)).toBe(2);
    expect(missing.stderr.join('\n')).toContain('needs a GitHub repository URL');

    const unknown = capture();
    expect(
      await runCli(['import', 'github.com/example/demo', '--bogus'], unknown.io),
    ).toBe(2);
  });

  it('documents the import command in the help text', async () => {
    const output = capture();

    const code = await runCli(['--help'], output.io);

    expect(code).toBe(0);
    expect(output.stdout.join('\n')).toContain('sothspell import <url>');
  });
});
