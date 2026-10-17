/**
 * The import package's public data shapes. `ImportService` is the seam the API
 * and the CLI share; `GitRemote` is the network seam tests replace with a local
 * bare repository.
 */

/** One imported project: a read-only clone plus the record of where it came from. */
export interface ImportRecord {
  /** `<owner>-<repo>-<shortCommit>`; also the clone directory name. */
  id: string;
  owner: string;
  repo: string;
  /** Human-facing source, e.g. `https://github.com/owner/repo`. */
  sourceUrl: string;
  /** Branch or tag the clone was pinned to; `null` means the default branch. */
  ref: string | null;
  /** Full resolved commit SHA. */
  commit: string;
  /** First 12 characters of `commit`; the id suffix. */
  shortCommit: string;
  /** Absolute path of the read-only clone under SOTHSPELL_HOME. */
  directory: string;
  sizeBytes: number;
  fileCount: number;
  /** ISO timestamp of the successful import. */
  importedAt: string;
}

export interface ImportResult {
  record: ImportRecord;
  /** `false` when the resolved revision was already imported (idempotent). */
  created: boolean;
}

export interface ImportRequest {
  url: string;
  ref?: string | null;
}

/** The network boundary: tests point this at a local bare repository. */
export interface GitRemote {
  clone(input: {
    url: string;
    ref?: string | null;
    destination: string;
  }): Promise<{ commit: string }>;
}

export interface ImportService {
  import(input: ImportRequest): Promise<ImportResult>;
  list(): Promise<ImportRecord[]>;
  get(id: string): Promise<ImportRecord | null>;
  /** Re-checks the remote; a moved HEAD creates a new import beside the old one. */
  refresh(id: string): Promise<ImportResult>;
  remove(id: string): Promise<boolean>;
}
