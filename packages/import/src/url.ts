import {
  InvalidImportUrlError,
  UnsupportedImportHostError,
  UnsafeImportPathError,
} from './errors.js';

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  /** Explicit ref from `/tree/<ref>`, or `null` for the default branch. */
  ref: string | null;
  /** The URL handed to git: `https://github.com/<owner>/<repo>.git`. */
  canonicalUrl: string;
}

/**
 * Hosts the import policy trusts. `www.github.com` is accepted but always
 * canonicalized to `github.com`; everything else is rejected before git runs.
 */
export const ALLOWED_IMPORT_HOSTS: readonly string[] = ['github.com', 'www.github.com'];

const OWNER_REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/+-]*$/;
const MAX_REF_LENGTH = 256;
const SCP_LIKE_PATTERN = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:/u;
const SCHEME_PATTERN = /^(https?|ssh):\/\//iu;

function decodeSegment(value: string, what: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new InvalidImportUrlError(`the ${what} is not valid percent-encoding`);
  }
}

/** Owner and repository names become directory names, so traversal must die here. */
function validateName(value: string, what: 'owner' | 'repository'): string {
  if (!OWNER_REPO_PATTERN.test(value) || value.includes('..')) {
    throw new UnsafeImportPathError(
      `the ${what} "${value}" is not a safe GitHub ${what} name`,
    );
  }
  return value;
}

function validateRef(value: string): string {
  if (
    value.length === 0 ||
    value.length > MAX_REF_LENGTH ||
    !REF_PATTERN.test(value) ||
    value.includes('..')
  ) {
    throw new InvalidImportUrlError(`the ref "${value}" is not a valid git ref`);
  }
  return value;
}

/**
 * Accepts `github.com/owner/repo`, `owner/repo`, HTTPS, `git@`, and `ssh://`
 * forms with an optional trailing `.git`, query string, or `/tree/<ref>`.
 * The result is canonicalized so every later layer sees one shape; anything
 * else throws a named `ImportUrlError` subclass.
 */
export function parseGitHubUrl(input: string): ParsedGitHubUrl {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (raw.length === 0) {
    throw new InvalidImportUrlError('the repository URL is empty');
  }

  // Query strings and fragments describe the page, not the repository.
  const withoutQuery = raw.split(/[?#]/u, 1)[0] ?? '';

  let host: string | null = null;
  let rest = withoutQuery;

  const scheme = SCHEME_PATTERN.exec(rest);
  if (scheme) {
    rest = rest.slice(scheme[0].length);
    const slash = rest.indexOf('/');
    if (slash === -1) {
      throw new InvalidImportUrlError(`"${raw}" does not name a repository`);
    }
    host = rest.slice(0, slash).split('@').pop() ?? '';
    rest = rest.slice(slash + 1);
  } else if (SCP_LIKE_PATTERN.test(rest)) {
    // scp-like: git@github.com:owner/repo.git
    const colon = rest.indexOf(':');
    host = rest.slice(0, colon).split('@').pop() ?? '';
    rest = rest.slice(colon + 1);
  } else if (rest.includes('://')) {
    const other = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//u.exec(rest);
    throw new InvalidImportUrlError(`unsupported URL scheme: ${other?.[1] ?? 'unknown'}`);
  } else {
    // `github.com/owner/repo` or the bare `owner/repo` shorthand. A dotted
    // first segment is host-like; anything else is treated as the owner.
    const slash = rest.indexOf('/');
    const first = slash === -1 ? rest : rest.slice(0, slash);
    if (first.includes('.')) {
      host = first;
      rest = slash === -1 ? '' : rest.slice(slash + 1);
    }
  }

  if (host !== null) {
    const normalizedHost = host.toLowerCase();
    if (!ALLOWED_IMPORT_HOSTS.includes(normalizedHost)) {
      throw new UnsupportedImportHostError(host);
    }
  }

  const segments = rest.split('/').filter((segment) => segment.length > 0);
  if (segments.length < 2) {
    throw new InvalidImportUrlError(`"${raw}" does not name a repository`);
  }

  const owner = validateName(decodeSegment(segments[0] ?? '', 'owner'), 'owner');
  const rawRepo = decodeSegment(segments[1] ?? '', 'repository');
  const repo = validateName(rawRepo.replace(/\.git$/iu, ''), 'repository');

  let ref: string | null = null;
  const tail = segments.slice(2);
  if (tail.length > 0) {
    if (tail[0] !== 'tree' || tail.length < 2) {
      throw new InvalidImportUrlError(
        `"${raw}" has path segments after the repository; expected /tree/<ref>`,
      );
    }
    ref = validateRef(
      tail
        .slice(1)
        .map((segment) => decodeSegment(segment, 'ref'))
        .join('/'),
    );
  }

  return {
    owner,
    repo,
    ref,
    canonicalUrl: `https://github.com/${owner}/${repo}.git`,
  };
}
