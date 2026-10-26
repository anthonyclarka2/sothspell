import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectRecord, ProjectSourceKind } from '@sothspell/authoring';

/**
 * A project record is the only local artifact that knows where a project's
 * source root lives. The tour, the snapshot, and every export deliberately
 * carry no absolute path, so the API resolves the root here, in that order:
 * the record for the tour's project slug, then the configured golden checkout.
 */

export const GOLDEN_PROJECT_SLUG = 'bunbun';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const SOURCE_KINDS = new Set<ProjectSourceKind>(['local', 'imported']);

export type ProjectRecordUnavailableReason =
  'missing-record' | 'invalid-record' | 'slug-mismatch' | 'missing-root';

export type ProjectRecordResolution =
  | {
      available: true;
      slug: string;
      root: string;
      record: ProjectRecord | null;
    }
  | {
      available: false;
      slug: string;
      root: null;
      reason: ProjectRecordUnavailableReason;
      record: ProjectRecord | null;
    };

export interface ResolveProjectSourceOptions {
  /** SOTHSPELL_HOME. */
  home: string;
  /** SOTHSPELL_PROJECT_ROOT or AppOptions.projectRoot. */
  configuredRoot: string | null;
  /** The one slug the configured root may stand in for. Defaults to Bunbun. */
  goldenSlug?: string;
}

function unavailable(
  slug: string,
  reason: ProjectRecordUnavailableReason,
  record: ProjectRecord | null = null,
): ProjectRecordResolution {
  return { available: false, slug, root: null, reason, record };
}

function isRecord(value: unknown): value is ProjectRecord {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<ProjectRecord>;
  const revision = record.revision as Partial<ProjectRecord['revision']> | undefined;
  return (
    typeof record.slug === 'string' &&
    SLUG_PATTERN.test(record.slug) &&
    typeof record.name === 'string' &&
    typeof record.sourceRoot === 'string' &&
    path.isAbsolute(record.sourceRoot) &&
    typeof record.sourceKind === 'string' &&
    SOURCE_KINDS.has(record.sourceKind as ProjectSourceKind) &&
    typeof record.updatedAt === 'string' &&
    revision !== undefined &&
    (revision.commit === null || typeof revision.commit === 'string') &&
    (revision.branch === null || typeof revision.branch === 'string') &&
    typeof revision.dirty === 'boolean'
  );
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function readRecord(
  home: string,
  slug: string,
): Promise<{
  record: ProjectRecord | null;
  reason: ProjectRecordUnavailableReason | null;
}> {
  const recordPath = path.join(home, 'projects', slug, 'project.json');
  let raw: string;
  try {
    raw = await readFile(recordPath, 'utf8');
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
    return { record: null, reason: missing ? 'missing-record' : 'invalid-record' };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return { record: null, reason: 'invalid-record' };
    }
    if (parsed.slug !== slug) {
      return { record: parsed, reason: 'slug-mismatch' };
    }
    return { record: parsed, reason: null };
  } catch {
    return { record: null, reason: 'invalid-record' };
  }
}

/** Reads the project slug a tour claims. The tour schema already constrains it. */
export async function readTourProjectSlug(tourJsonPath: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(tourJsonPath, 'utf8')) as {
      project?: { slug?: unknown };
    };
    const slug = parsed.project?.slug;
    return typeof slug === 'string' && SLUG_PATTERN.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the local source root for one tour project. A missing record is not
 * fatal for the golden Bunbun tour: the configured checkout is allowed to stand
 * in, but only for that slug. Every other project must have a record, so an
 * arbitrary configured path can never become another project's source.
 */
export async function resolveProjectSource(
  slug: string,
  options: ResolveProjectSourceOptions,
): Promise<ProjectRecordResolution> {
  const goldenSlug = options.goldenSlug ?? GOLDEN_PROJECT_SLUG;
  if (!SLUG_PATTERN.test(slug)) {
    return unavailable(slug, 'invalid-record');
  }

  const { record, reason } = await readRecord(options.home, slug);
  if (record && reason === null) {
    if (await isDirectory(record.sourceRoot)) {
      return {
        available: true,
        slug,
        root: record.sourceRoot,
        record,
      };
    }
    if (slug !== goldenSlug) {
      return unavailable(slug, 'missing-root', record);
    }
  }

  if (options.configuredRoot && slug === goldenSlug) {
    if (await isDirectory(options.configuredRoot)) {
      return {
        available: true,
        slug,
        root: options.configuredRoot,
        record: null,
      };
    }
    return unavailable(slug, 'missing-root', record);
  }

  return unavailable(slug, reason ?? 'missing-record', record);
}
