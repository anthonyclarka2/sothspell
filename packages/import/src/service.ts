import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import type { Dirent } from 'node:fs';
import { ImportLimitError, ImportNotFoundError } from './errors.js';
import { createGitRemote } from './git-remote.js';
import { createImportPolicy, type ImportPolicy } from './policy.js';
import { parseGitHubUrl } from './url.js';
import type { GitRemote, ImportRecord, ImportResult, ImportService } from './types.js';

export interface ImportServiceOptions {
  /** SOTHSPELL_HOME. Imports live under `<home>/projects/imported`. */
  home: string;
  policy?: ImportPolicy;
  /** Git adapter; defaults to the local `git` executable behind the policy. */
  remote?: GitRemote;
}

export function importedProjectsDirectory(home: string): string {
  return path.join(home, 'projects', 'imported');
}

/** Ids come from parsed owner/repo names, but `get`/`remove` take user input. */
const IMPORT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

function isSafeImportId(id: string): boolean {
  return IMPORT_ID_PATTERN.test(id) && !id.includes('..');
}

interface TreeStats {
  sizeBytes: number;
  fileCount: number;
}

/**
 * Walks the clone with `lstat` and never follows symlinks, so a malicious
 * repository cannot point the walk at files outside the clone.
 */
async function measureTree(root: string): Promise<TreeStats> {
  let sizeBytes = 0;
  let fileCount = 0;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop() ?? root;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(full);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      sizeBytes += (await lstat(full)).size;
      fileCount += 1;
    }
  }
  return { sizeBytes, fileCount };
}

type TreeEntryKind = 'directory' | 'file' | 'symlink' | 'other';

function kindOf(entry: Dirent): TreeEntryKind {
  if (entry.isDirectory()) {
    return 'directory';
  }
  if (entry.isSymbolicLink()) {
    return 'symlink';
  }
  if (entry.isFile()) {
    return 'file';
  }
  return 'other';
}

async function walkTree(
  root: string,
  visit: (fullPath: string, kind: TreeEntryKind, isRoot: boolean) => Promise<void>,
): Promise<void> {
  await visit(root, 'directory', true);
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop() ?? root;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const kind = kindOf(entry);
      if (kind === 'directory') {
        pending.push(full);
      }
      await visit(full, kind, false);
    }
  }
}

/** Read-only marking is the product promise; write bits go away for good. */
async function markReadOnly(root: string): Promise<void> {
  if (process.platform === 'win32') {
    return;
  }
  await walkTree(root, async (fullPath, kind, isRoot) => {
    if (!isRoot && kind === 'symlink') {
      // chmod follows symlinks; never touch a target outside the clone.
      return;
    }
    const mode = (await lstat(fullPath)).mode;
    await chmod(fullPath, mode & ~0o222);
  });
}

/** Removal needs the write bits back; only the owner needs them. */
async function restoreWritable(root: string): Promise<void> {
  if (process.platform === 'win32') {
    return;
  }
  await walkTree(root, async (fullPath, kind, isRoot) => {
    if (!isRoot && kind === 'symlink') {
      return;
    }
    const stats = await lstat(fullPath).catch(() => null);
    if (!stats) {
      return;
    }
    const restore = kind === 'directory' ? 0o700 : 0o200;
    await chmod(fullPath, (stats.mode & 0o777) | restore);
  });
}

async function removeTree(root: string): Promise<void> {
  await restoreWritable(root).catch(() => undefined);
  await rm(root, { recursive: true, force: true });
}

/**
 * Imports are read-only clones under `SOTHSPELL_HOME/projects/imported`, each
 * named `<owner>-<repo>-<shortCommit>` with a sibling `<id>.json` record. The
 * clone itself is never written to; refresh clones a fresh staging directory
 * and only renames it into place when the remote moved.
 */
export function createImportService(options: ImportServiceOptions): ImportService {
  const root = importedProjectsDirectory(options.home);
  const policy = options.policy ?? createImportPolicy();
  const remote = options.remote ?? createGitRemote({ policy });

  function metadataPath(id: string): string {
    return path.join(root, `${id}.json`);
  }

  async function readRecord(id: string): Promise<ImportRecord | null> {
    if (!isSafeImportId(id)) {
      return null;
    }
    try {
      const raw = await readFile(metadataPath(id), 'utf8');
      const record = JSON.parse(raw) as ImportRecord;
      if (
        record.id !== id ||
        typeof record.directory !== 'string' ||
        typeof record.commit !== 'string'
      ) {
        return null;
      }
      return record;
    } catch {
      return null;
    }
  }

  async function finalizeImport(input: {
    owner: string;
    repo: string;
    sourceUrl: string;
    ref: string | null;
    staging: string;
    commit: string;
  }): Promise<ImportResult> {
    const shortCommit = input.commit.slice(0, 12);
    const id = `${input.owner}-${input.repo}-${shortCommit}`;

    const existing = await readRecord(id);
    if (existing) {
      await removeTree(input.staging);
      return { record: existing, created: false };
    }

    const stats = await measureTree(input.staging);
    if (stats.sizeBytes > policy.maxBytes) {
      throw new ImportLimitError('bytes', stats.sizeBytes, policy.maxBytes);
    }
    if (stats.fileCount > policy.maxFiles) {
      throw new ImportLimitError('files', stats.fileCount, policy.maxFiles);
    }

    await markReadOnly(input.staging);
    const destination = path.join(root, id);
    try {
      await rename(input.staging, destination);
    } catch (error) {
      const raced = await readRecord(id);
      if (raced) {
        await removeTree(input.staging);
        return { record: raced, created: false };
      }
      // A directory without a record is a crashed earlier import; replace it.
      await removeTree(destination);
      await rename(input.staging, destination).catch(() => {
        throw error;
      });
    }

    const record: ImportRecord = {
      id,
      owner: input.owner,
      repo: input.repo,
      sourceUrl: input.sourceUrl,
      ref: input.ref,
      commit: input.commit,
      shortCommit,
      directory: destination,
      sizeBytes: stats.sizeBytes,
      fileCount: stats.fileCount,
      importedAt: new Date().toISOString(),
    };
    await writeFile(metadataPath(id), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return { record, created: true };
  }

  async function runImport(
    url: string,
    ref: string | null | undefined,
  ): Promise<ImportResult> {
    // Parse before any filesystem work so a rejected URL leaves no trace.
    const parsed = parseGitHubUrl(url);
    const selectedRef = ref ?? parsed.ref ?? null;

    await mkdir(root, { recursive: true });
    const staging = await mkdtemp(path.join(root, 'staging-'));
    try {
      const { commit } = await remote.clone({
        url: parsed.canonicalUrl,
        ref: selectedRef,
        destination: staging,
      });
      return await finalizeImport({
        owner: parsed.owner,
        repo: parsed.repo,
        sourceUrl: parsed.canonicalUrl.replace(/\.git$/u, ''),
        ref: selectedRef,
        staging,
        commit,
      });
    } catch (error) {
      await removeTree(staging).catch(() => undefined);
      throw error;
    }
  }

  return {
    async import(input) {
      return runImport(input.url, input.ref);
    },

    async list() {
      let entries: Dirent[];
      try {
        entries = await readdir(root, { withFileTypes: true });
      } catch {
        return [];
      }
      const records: ImportRecord[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) {
          continue;
        }
        const record = await readRecord(entry.name.slice(0, -'.json'.length));
        if (record) {
          records.push(record);
        }
      }
      return records.toSorted((left, right) =>
        left.importedAt === right.importedAt
          ? left.id.localeCompare(right.id)
          : right.importedAt.localeCompare(left.importedAt),
      );
    },

    async get(id) {
      return readRecord(id);
    },

    async refresh(id) {
      const record = await readRecord(id);
      if (!record) {
        throw new ImportNotFoundError(id);
      }
      return runImport(record.sourceUrl, record.ref);
    },

    async remove(id) {
      const record = await readRecord(id);
      if (!record) {
        return false;
      }
      await removeTree(record.directory);
      await rm(metadataPath(id), { force: true });
      return true;
    },
  };
}
