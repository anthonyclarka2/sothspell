export type FileLanguage =
  | 'typescript'
  | 'tsx'
  | 'javascript'
  | 'jsx'
  | 'svelte'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'json'
  | 'jsonc'
  | 'markdown'
  | 'mdx'
  | 'prisma'
  | 'css'
  | 'html'
  | 'bash'
  | 'sql'
  | 'yaml'
  | 'text'
  | 'binary';

/**
 * A language an adapter claims. It is the unit the snapshot's language mix, the
 * dependency graph, and the authoring budget group by; `FileLanguage` stays the
 * per-file detail (for example `tsx` is parsed as `typescript`).
 */
export type LanguageId =
  'typescript' | 'javascript' | 'svelte' | 'python' | 'go' | 'rust' | 'java';

export interface FileEntry {
  path: string;
  language: FileLanguage;
  bytes: number;
  hash: string;
  lineCount: number;
  isBinary: boolean;
  redacted: boolean;
  redactionReason?: string;
  lastModifiedMs: number;
}

export interface LanguageStat {
  /** File language as recorded on the file entry, exactly as v1 reported it. */
  language: FileLanguage;
  /** Adapter language that owns the file language, or the file language itself. */
  id: LanguageId | FileLanguage;
  files: number;
  bytes: number;
  lines: number;
  /**
   * True for the single file language with the most source bytes. At most one
   * entry carries it; non-source languages (docs, config, assets) never do.
   */
  primary: boolean;
}

export interface PackageManifest {
  name: string;
  version: string | null;
  path: string;
  private: boolean;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface DocEntry {
  path: string;
  title: string;
  summary: string;
}

export interface PrismaField {
  name: string;
  type: string;
  attributes: string[];
}

export interface PrismaModel {
  name: string;
  path: string;
  fields: PrismaField[];
}

export type SymbolKind =
  | 'module'
  | 'class'
  | 'method'
  | 'property'
  | 'function'
  | 'variable'
  | 'interface'
  | 'type'
  | 'enum'
  | 'namespace'
  | 'object'
  | 'model'
  | 'other';

export interface SymbolDecorator {
  name: string;
  argument: string | null;
}

export interface SymbolNode {
  id: string;
  kind: SymbolKind;
  name: string;
  qualifiedName: string;
  path: string;
  startLine: number;
  endLine: number;
  exported: boolean;
  parentId: string | null;
  decorators: SymbolDecorator[];
  signature: string;
  documentation: string | null;
  /** The language that produced the symbol, so mixed-language snapshots stay readable. */
  language: LanguageId | FileLanguage;
}

export interface ImportBinding {
  imported: string;
  local: string;
}

export interface FileImport {
  specifier: string;
  bindings: ImportBinding[];
}

/** The per-file parse result every adapter returns. */
export interface FileAnalysis {
  symbols: SymbolNode[];
  imports: FileImport[];
  exportedNames: string[];
  parseErrors: string[];
  /** Direct evidence that the file is an entry point (a `main` function and so on). */
  entryPoint: boolean;
}

export type GraphEdgeKind = 'imports' | 'references' | 'package-imports' | 'contains';

export interface GraphEdge {
  from: string;
  to: string;
  kind: GraphEdgeKind;
  confidence: 'syntax' | 'import';
}

export interface ProjectGraph {
  fileImports: Array<{ from: string; to: string; specifier: string }>;
  packageImports: Array<{ from: string; packageName: string; specifier: string }>;
  edges: GraphEdge[];
  entryPoints: string[];
}

export interface AnalysisWarning {
  path: string;
  kind: 'redacted' | 'large-file' | 'binary' | 'parse-error';
  message: string;
}

export type ManifestDependencyKind = 'runtime' | 'dev' | 'build' | 'unknown';

export interface ManifestDependency {
  name: string;
  version: string | null;
  kind: ManifestDependencyKind;
}

/**
 * The brief-sized view of a build manifest. The raw file stays in the snapshot
 * manifest with its hash, so a tour can anchor the manifest itself.
 */
export interface LanguageManifest {
  path: string;
  language: LanguageId;
  buildSystem: string;
  name: string | null;
  version: string | null;
  /** Entry points declared by the build (console scripts, binaries, main class). */
  entryPoints: string[];
  dependencies: ManifestDependency[];
}

export interface LanguageRuntimeStat {
  id: LanguageId;
  grammarBytes: number;
  loadMs: number;
  abiVersion: number;
}

export interface ProjectRevision {
  commit: string | null;
  branch: string | null;
  dirty: boolean;
}

export interface ProjectIdentity {
  slug: string;
  name: string;
  fingerprint: string;
}

export interface AnalysisStats {
  durationMs: number;
  cacheHits: number;
  cacheMisses: number;
  /** Per-language parser runtime cost, recorded only for detected languages. */
  languageRuntimes: LanguageRuntimeStat[];
}

export interface BriefApplication {
  name: string;
  packageName: string;
  path: string;
  kind: 'api' | 'web' | 'test' | 'app';
  entryPoints: string[];
  symbolCount: number;
}

export interface FeatureModule {
  name: string;
  path: string;
  files: number;
  symbols: number;
  representativeSymbols: string[];
}

export interface LanguageModule {
  name: string;
  path: string;
  files: number;
  symbols: number;
  representativeSymbols: string[];
}

export interface NotableSymbol {
  id: string;
  qualifiedName: string;
  kind: SymbolKind;
  path: string;
}

/**
 * The per-language brief: build system, entry points, module layout, notable
 * symbols, and the language's known limits. One entry per detected language.
 */
export interface LanguageBrief {
  id: LanguageId;
  files: number;
  bytes: number;
  lines: number;
  primary: boolean;
  fileLanguages: FileLanguage[];
  buildSystems: string[];
  manifests: string[];
  entryPoints: string[];
  modules: LanguageModule[];
  notableSymbols: NotableSymbol[];
  risks: string[];
}

export interface ProjectBrief {
  project: ProjectIdentity;
  revision: ProjectRevision;
  workspace: { kind: 'pnpm' | 'single'; packages: PackageManifest[] };
  languages: LanguageStat[];
  languageBriefs: LanguageBrief[];
  applications: BriefApplication[];
  featureModules: FeatureModule[];
  docs: DocEntry[];
  plans: DocEntry[];
  prismaModels: Array<{ name: string; path: string; fields: number }>;
  graphStats: {
    files: number;
    symbols: number;
    fileImports: number;
    packageImports: number;
    references: number;
    entryPoints: string[];
  };
}

export interface ProjectSnapshot {
  id: string;
  project: ProjectIdentity;
  revision: ProjectRevision;
  createdAt: string;
  analyzerVersion: string;
  ignoreVersion: string;
  files: FileEntry[];
  languages: LanguageStat[];
  packages: PackageManifest[];
  docs: DocEntry[];
  prismaModels: PrismaModel[];
  manifests: LanguageManifest[];
  symbols: SymbolNode[];
  graph: ProjectGraph;
  warnings: AnalysisWarning[];
  analysis: AnalysisStats;
}
