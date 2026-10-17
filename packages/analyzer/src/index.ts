export {
  ANALYZER_VERSION,
  analyzeProject,
  snapshotId,
  type AnalyzeOptions,
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

export type {
  AnalysisStats,
  AnalysisWarning,
  BriefApplication,
  DocEntry,
  FeatureModule,
  FileEntry,
  FileLanguage,
  GraphEdge,
  LanguageStat,
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
