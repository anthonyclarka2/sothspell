/**
 * Named import errors. Routes, the CLI, and the web UI branch on these types,
 * so each failure mode gets its own class instead of a string match.
 */

export type ImportUrlErrorCode = 'invalid-url' | 'unsupported-host' | 'unsafe-path';

export class ImportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImportError';
  }
}

/** Base for every rejected URL; `code` says which check failed. */
export class ImportUrlError extends ImportError {
  readonly code: ImportUrlErrorCode;

  constructor(code: ImportUrlErrorCode, message: string) {
    super(message);
    this.name = 'ImportUrlError';
    this.code = code;
  }
}

export class InvalidImportUrlError extends ImportUrlError {
  constructor(message: string) {
    super('invalid-url', message);
    this.name = 'InvalidImportUrlError';
  }
}

export class UnsupportedImportHostError extends ImportUrlError {
  readonly host: string;

  constructor(host: string) {
    super(
      'unsupported-host',
      `only public GitHub repositories are importable; "${host}" is not supported`,
    );
    this.name = 'UnsupportedImportHostError';
    this.host = host;
  }
}

export class UnsafeImportPathError extends ImportUrlError {
  constructor(message: string) {
    super('unsafe-path', message);
    this.name = 'UnsafeImportPathError';
  }
}

export class ImportTimeoutError extends ImportError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, detail = 'git clone') {
    super(`${detail} timed out after ${timeoutMs} ms`);
    this.name = 'ImportTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class ImportLimitError extends ImportError {
  readonly limit: 'bytes' | 'files';
  readonly actual: number;
  readonly allowed: number;

  constructor(limit: 'bytes' | 'files', actual: number, allowed: number) {
    super(
      limit === 'bytes'
        ? `the repository is ${actual} bytes; the import limit is ${allowed} bytes`
        : `the repository has ${actual} files; the import limit is ${allowed} files`,
    );
    this.name = 'ImportLimitError';
    this.limit = limit;
    this.actual = actual;
    this.allowed = allowed;
  }
}

export class ImportNotFoundError extends ImportError {
  readonly id: string;

  constructor(id: string) {
    super(`no import with id "${id}"`);
    this.name = 'ImportNotFoundError';
    this.id = id;
  }
}

/** `git` itself failed: unknown repository, network refused, bad ref. */
export class ImportCloneError extends ImportError {
  constructor(message: string) {
    super(message);
    this.name = 'ImportCloneError';
  }
}
