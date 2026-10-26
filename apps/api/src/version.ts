import { readFileSync } from 'node:fs';

/**
 * The root package version is the release identity. Reading it at runtime keeps
 * the health endpoint and CLI from drifting away from the tag; a test pins the
 * workspace manifests to the same value.
 */
const rootPackage = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { version?: unknown };

if (
  typeof rootPackage.version !== 'string' ||
  !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(rootPackage.version)
) {
  throw new Error('package.json must carry a semver version');
}

export const SOTHSPELL_VERSION = rootPackage.version;
