export {
  ANALYZER_VERSION,
  analyzeProject,
  snapshotId,
  type AnalyzeOptions,
  type SnapshotParts,
} from './analyze.js';

export { buildProjectBrief, renderProjectBriefMarkdown } from './brief.js';

export { resolveAnchor, type AnchorInput, type ResolvedAnchor } from './anchor.js';

export { parsePrismaModels } from './prisma.js';

export { loadSnapshot, saveSnapshot, snapshotPathFor } from './store.js';

export {
  listProjectFiles,
  readProjectFile,
  redactionReason,
  type ReadFileResult,
} from './source.js';

export {
  LANGUAGE_ANALYZERS,
  detectedAnalyzers,
  detectionFor,
  languageIdFor,
  primaryLanguage,
  type LanguageDetection,
} from './languages/index.js';

export type {
  EntryPointInput,
  FileLanguageClaim,
  LanguageAnalyzer,
  ManifestInput,
  ParseRequest,
} from './port.js';

export type {
  AnalysisStats,
  AnalysisWarning,
  BriefApplication,
  DocEntry,
  FeatureModule,
  FileAnalysis,
  FileEntry,
  FileImport,
  FileLanguage,
  GraphEdge,
  ImportBinding,
  LanguageBrief,
  LanguageId,
  LanguageManifest,
  LanguageModule,
  LanguageRuntimeStat,
  LanguageStat,
  ManifestDependency,
  ManifestDependencyKind,
  NotableSymbol,
  PackageManifest,
  PrismaField,
  PrismaModel,
  ProjectBrief,
  ProjectGraph,
  ProjectIdentity,
  ProjectRevision,
  ProjectSnapshot,
  SymbolDecorator,
  SymbolKind,
  SymbolNode,
} from './types.js';
