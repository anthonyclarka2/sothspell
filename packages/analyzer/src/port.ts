import type {
  FileAnalysis,
  FileEntry,
  FileLanguage,
  LanguageId,
  LanguageManifest,
  LanguageRuntimeStat,
} from './types.js';

export interface ParseRequest {
  path: string;
  text: string;
  /** The per-file language, for example `tsx`. */
  fileLanguage: FileLanguage;
  /** The adapter language, for example `typescript`. */
  language: LanguageId;
}

export interface EntryPointInput {
  /** The parsed source files this analyzer owns. */
  files: FileEntry[];
  analyses: ReadonlyMap<string, FileAnalysis>;
}

export interface ManifestInput {
  path: string;
  text: string;
}

/** One file language an adapter parses, and the language id it reports for it. */
export interface FileLanguageClaim {
  fileLanguage: FileLanguage;
  language: LanguageId;
}

/**
 * One language adapter. The analyzer pipeline owns file discovery, hashing,
 * caching, redaction, and the snapshot shape; an adapter only knows how to read
 * one language's syntax, imports, entry points, and build manifest.
 *
 * Adapters are pure: they never execute project code, install dependencies, or
 * touch the network. A grammar-backed adapter may load its parser runtime in
 * `prepare`, which the pipeline calls once per analysis and only for languages
 * that were actually detected.
 */
export interface LanguageAnalyzer {
  readonly id: LanguageId;
  readonly displayName: string;
  /** File languages this adapter parses, for example `tsx` and `svelte`. */
  readonly claims: readonly FileLanguageClaim[];
  /** True when the adapter needs a WASM grammar before it can parse. */
  readonly requiresGrammar: boolean;
  /** Known limits of this adapter, surfaced in the project brief. */
  readonly risks: readonly string[];
  /** Loads the parser runtime once per analysis. Returns the recorded cost. */
  prepare?(): Promise<LanguageRuntimeStat | null>;
  /** Parses one file. Synchronous once `prepare` has run. */
  parse(request: ParseRequest): FileAnalysis;
  /**
   * Resolves a specifier to a project-relative file when the language has
   * file-level imports. Returns null when the import is external or unknown;
   * that is never an error.
   */
  resolveImport(
    fromPath: string,
    specifier: string,
    fileSet: ReadonlySet<string>,
  ): string | null;
  /** True when an unresolved specifier is a real dependency of the project. */
  isExternal(specifier: string): boolean;
  /** The dependency name (package, module path, crate, or class) a specifier belongs to. */
  packageName(specifier: string): string;
  /** Entry point paths, from conventions and from parse evidence. */
  entryPoints(input: EntryPointInput): string[];
  /** Manifest file names this adapter reads, matched on basename. */
  readonly manifestNames: readonly string[];
  readManifest?(input: ManifestInput): LanguageManifest | null;
  /** Extra documentation paths beyond README, CONTEXT, docs/, and plans/. */
  matchesDoc?(path: string): boolean;
}
