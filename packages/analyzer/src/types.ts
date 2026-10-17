export type FileLanguage =
  | 'typescript'
  | 'tsx'
  | 'javascript'
  | 'jsx'
  | 'svelte'
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
  language: FileLanguage;
  files: number;
  bytes: number;
  lines: number;
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
  | 'object';

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

export interface ProjectBrief {
  project: ProjectIdentity;
  revision: ProjectRevision;
  workspace: { kind: 'pnpm' | 'single'; packages: PackageManifest[] };
  languages: LanguageStat[];
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
  symbols: SymbolNode[];
  graph: ProjectGraph;
  warnings: AnalysisWarning[];
  analysis: AnalysisStats;
}
