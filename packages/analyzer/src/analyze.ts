import { execFile } from 'node:child_process';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import fg from 'fast-glob';
import { hashText } from '@sothspell/core';
import {
  LANGUAGE_ANALYZERS,
  detectedAnalyzers,
  detectionFor,
  languageIdFor,
  primaryLanguage,
} from './languages/index.js';
import type { LanguageAnalyzer } from './port.js';
import { parsePrismaModels } from './prisma.js';
import { listProjectFiles, readProjectFile } from './source.js';
import type {
  AnalysisStats,
  AnalysisWarning,
  DocEntry,
  FileAnalysis,
  FileEntry,
  GraphEdge,
  LanguageManifest,
  LanguageRuntimeStat,
  LanguageStat,
  PackageManifest,
  PrismaModel,
  ProjectGraph,
  ProjectRevision,
  ProjectSnapshot,
  SymbolNode,
} from './types.js';

const execFileAsync = promisify(execFile);

export const ANALYZER_VERSION = '0.3.0';
export const IGNORE_VERSION = '1';

export interface AnalyzeOptions {
  /** Per-file parse cache. Defaults to a temp-free in-memory pass when absent. */
  cacheDirectory?: string;
  /** Called after each file is read; useful for CLI progress output. */
  onProgress?: (progress: { phase: 'read' | 'parse' | 'done'; path?: string }) => void;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return slug.length > 1 ? slug : 'project';
}

async function readRevision(root: string): Promise<ProjectRevision> {
  try {
    const [{ stdout: commit }, { stdout: branch }, { stdout: status }] =
      await Promise.all([
        execFileAsync('git', ['-C', root, 'rev-parse', 'HEAD']),
        execFileAsync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD']),
        execFileAsync('git', ['-C', root, 'status', '--porcelain']),
      ]);
    return {
      commit: commit.trim().slice(0, 64),
      branch: branch.trim() || null,
      dirty: status.trim().length > 0,
    };
  } catch {
    return { commit: null, branch: null, dirty: false };
  }
}

function readStringMap(value: unknown): Record<string, string> {
  if (value === null || typeof value !== 'object') {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      result[key] = entry;
    }
  }
  return result;
}

async function readPackages(root: string): Promise<PackageManifest[]> {
  const manifests = await fg(['package.json', '*/package.json', '*/*/package.json'], {
    cwd: root,
    dot: false,
    onlyFiles: true,
    ignore: ['**/node_modules/**', '**/dist/**'],
  });

  const packages: PackageManifest[] = [];
  for (const manifestPath of manifests.toSorted()) {
    try {
      const parsed = JSON.parse(
        await readFile(path.join(root, manifestPath), 'utf8'),
      ) as Record<string, unknown>;
      if (typeof parsed.name !== 'string') {
        continue;
      }
      packages.push({
        name: parsed.name,
        version: typeof parsed.version === 'string' ? parsed.version : null,
        path:
          path.posix.dirname(manifestPath) === '.'
            ? ''
            : path.posix.dirname(manifestPath),
        private: parsed.private === true,
        scripts: readStringMap(parsed.scripts),
        dependencies: readStringMap(parsed.dependencies),
        devDependencies: readStringMap(parsed.devDependencies),
      });
    } catch {
      // A malformed package.json is not fatal for the snapshot; the file entry
      // still records its hash and the warning list explains the gap.
    }
  }
  return packages;
}

function firstHeading(text: string): string {
  for (const line of text.split('\n')) {
    const match = /^#\s+(.+)$/.exec(line.trim());
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return '';
}

function firstParagraph(text: string): string {
  const lines = text.split('\n');
  let inBody = false;
  const paragraph: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inBody) {
      if (/^#\s+/.test(trimmed)) {
        inBody = true;
      }
      continue;
    }
    if (trimmed.length === 0) {
      if (paragraph.length > 0) {
        break;
      }
      continue;
    }
    if (trimmed.startsWith('#')) {
      break;
    }
    paragraph.push(trimmed);
  }
  return paragraph.join(' ').slice(0, 240);
}

function isDocPath(filePath: string): boolean {
  return (
    (filePath === 'README.md' ||
      filePath === 'CONTEXT.md' ||
      filePath.startsWith('docs/') ||
      filePath.startsWith('plans/')) &&
    filePath.endsWith('.md')
  );
}

/** `docs/index.rst` and friends: a reStructuredText title is underlined. */
function rstHeading(text: string): { title: string; summary: string } {
  const lines = text.split('\n');
  const underline = /^[=\-~^"'#*+]{3,}$/;
  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = (lines[index] ?? '').trim();
    const next = (lines[index + 1] ?? '').trim();
    if (line.length === 0 || !underline.test(next)) {
      continue;
    }
    const paragraph: string[] = [];
    for (const candidate of lines.slice(index + 2)) {
      const trimmed = candidate.trim();
      if (trimmed.length === 0) {
        if (paragraph.length > 0) {
          break;
        }
        continue;
      }
      if (underline.test(trimmed)) {
        continue;
      }
      paragraph.push(trimmed);
    }
    return { title: line, summary: paragraph.join(' ').slice(0, 240) };
  }
  return { title: '', summary: '' };
}

async function readDocs(
  root: string,
  files: FileEntry[],
  analyzers: readonly LanguageAnalyzer[],
): Promise<DocEntry[]> {
  const entries: DocEntry[] = [];
  for (const file of files) {
    const isAdapterDoc = analyzers.some(
      (analyzer) => analyzer.matchesDoc?.(file.path) === true,
    );
    if ((!isDocPath(file.path) && !isAdapterDoc) || file.redacted || file.isBinary) {
      continue;
    }
    const text = await readFile(path.join(root, file.path), 'utf8').catch(() => null);
    if (text === null) {
      continue;
    }
    const structured = file.path.endsWith('.rst')
      ? rstHeading(text)
      : { title: firstHeading(text), summary: firstParagraph(text) };
    entries.push({
      path: file.path,
      title: structured.title || path.basename(file.path).replace(/\.[^.]+$/, ''),
      summary: structured.summary,
    });
  }
  return entries;
}

function aggregateLanguages(files: FileEntry[], primary: string | null): LanguageStat[] {
  const byLanguage = new Map<string, LanguageStat>();
  for (const file of files) {
    const current = byLanguage.get(file.language) ?? {
      language: file.language,
      id: languageIdFor(file.language) ?? file.language,
      files: 0,
      bytes: 0,
      lines: 0,
      primary: false,
    };
    current.files += 1;
    current.bytes += file.bytes;
    current.lines += file.lineCount;
    byLanguage.set(file.language, current);
  }

  const stats = [...byLanguage.values()].toSorted((left, right) =>
    left.language.localeCompare(right.language),
  );

  // Exactly one entry carries `primary`: the biggest file language that belongs
  // to the primary language. Ties break on the file language name.
  const candidates = stats
    .filter((entry) => entry.id === primary)
    .toSorted(
      (left, right) =>
        right.bytes - left.bytes || left.language.localeCompare(right.language),
    );
  if (candidates[0]) {
    candidates[0].primary = true;
  }
  return stats;
}

function moduleSymbolId(filePath: string): string {
  return `symbol:${filePath}`;
}

interface SourceAnalysis {
  symbols: SymbolNode[];
  graph: ProjectGraph;
  warnings: AnalysisWarning[];
  cacheHits: number;
  cacheMisses: number;
  languageRuntimes: LanguageRuntimeStat[];
  /** Analyzers that either parsed a source file or contributed a manifest. */
  analyzers: LanguageAnalyzer[];
}

interface CachedAnalysis {
  version: string;
  key: string;
  analysis: FileAnalysis;
}

async function readCachedAnalysis(
  cacheDirectory: string,
  key: string,
): Promise<FileAnalysis | null> {
  const cacheFile = path.join(
    cacheDirectory,
    `${hashText(key).slice('sha256:'.length)}.json`,
  );
  try {
    const raw = await readFile(cacheFile, 'utf8');
    const parsed = JSON.parse(raw) as CachedAnalysis;
    if (parsed.version === ANALYZER_VERSION && parsed.key === key) {
      return parsed.analysis;
    }
  } catch {
    // A missing or unreadable cache entry is a normal miss.
  }
  return null;
}

async function writeCachedAnalysis(
  cacheDirectory: string,
  key: string,
  analysis: FileAnalysis,
): Promise<void> {
  const cacheFile = path.join(
    cacheDirectory,
    `${hashText(key).slice('sha256:'.length)}.json`,
  );
  try {
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(
      cacheFile,
      JSON.stringify({
        version: ANALYZER_VERSION,
        key,
        analysis,
      } satisfies CachedAnalysis),
      'utf8',
    );
  } catch {
    // The cache is an optimization; a read-only home must not fail analysis.
  }
}

function isParseableLanguage(language: FileEntry['language']): boolean {
  return detectionFor(language) !== null;
}

/**
 * Reads every detected language's files through its adapter, resolves imports,
 * collects entry points, and returns the merged symbol and graph view. Caching,
 * redaction, and ordering stay pipeline concerns so adapters cannot drift apart.
 */
async function buildSourceAnalysis(
  files: FileEntry[],
  texts: Map<string, string>,
  parseTexts: Map<string, string>,
  cacheDirectory: string | undefined,
): Promise<SourceAnalysis> {
  const sourceFiles = files.filter(
    (file) =>
      (texts.has(file.path) || parseTexts.has(file.path)) &&
      isParseableLanguage(file.language),
  );
  const fileSet = new Set(files.map((file) => file.path));
  const analyzers = detectedAnalyzers(sourceFiles);
  const fileNames = new Set(files.map((file) => path.posix.basename(file.path)));
  const manifestAnalyzers = LANGUAGE_ANALYZERS.filter((analyzer) =>
    analyzer.manifestNames.some((name) => fileNames.has(name)),
  );
  const contributingAnalyzers = LANGUAGE_ANALYZERS.filter(
    (analyzer) => analyzers.includes(analyzer) || manifestAnalyzers.includes(analyzer),
  );

  // Grammars load lazily: only for languages this project actually contains.
  const languageRuntimes: LanguageRuntimeStat[] = [];
  for (const analyzer of analyzers) {
    const runtime = await analyzer.prepare?.();
    if (runtime) {
      languageRuntimes.push(runtime);
    }
  }

  const symbols: SymbolNode[] = [];
  const warnings: AnalysisWarning[] = [];
  const fileImports: ProjectGraph['fileImports'] = [];
  const packageImports: ProjectGraph['packageImports'] = [];
  const edges: GraphEdge[] = [];
  const exportedByFile = new Map<string, Map<string, string>>();
  const analysesByFile = new Map<string, FileAnalysis>();
  let cacheHits = 0;
  let cacheMisses = 0;

  for (const file of sourceFiles) {
    const detection = detectionFor(file.language);
    const text = texts.get(file.path) ?? parseTexts.get(file.path);
    if (detection === null || text === undefined) {
      continue;
    }
    const redacted = !texts.has(file.path);

    const cacheKey = `${ANALYZER_VERSION}\u0000${file.path}\u0000${file.language}\u0000${file.hash}\u0000${redacted ? 'redacted' : 'plain'}`;
    let analysis =
      cacheDirectory === undefined
        ? null
        : await readCachedAnalysis(cacheDirectory, cacheKey);

    if (analysis) {
      cacheHits += 1;
    } else {
      cacheMisses += 1;
      analysis = detection.analyzer.parse({
        path: file.path,
        text,
        fileLanguage: file.language,
        language: detection.language,
      });
      if (redacted) {
        // The file is parsed for names and relationships, but none of its
        // signatures or decorator arguments may reach the snapshot.
        analysis = {
          ...analysis,
          symbols: analysis.symbols.map((symbol) => ({
            ...symbol,
            signature: '',
            decorators: [],
            documentation: null,
          })),
        };
      }
      if (cacheDirectory !== undefined) {
        await writeCachedAnalysis(cacheDirectory, cacheKey, analysis);
      }
    }

    symbols.push(...analysis.symbols);
    analysesByFile.set(file.path, analysis);
    for (const error of analysis.parseErrors) {
      warnings.push({
        path: file.path,
        kind: 'parse-error',
        message: error,
      });
    }

    const exports = new Map<string, string>();
    for (const symbol of analysis.symbols) {
      if (symbol.kind !== 'module' && symbol.exported) {
        exports.set(symbol.qualifiedName.split('.').pop() ?? symbol.name, symbol.id);
      }
    }
    exportedByFile.set(file.path, exports);
  }

  const edgeKeys = new Set<string>();
  const addEdge = (edge: GraphEdge): void => {
    const key = `${edge.from}\u0000${edge.to}\u0000${edge.kind}`;
    if (edgeKeys.has(key)) {
      return;
    }
    edgeKeys.add(key);
    edges.push(edge);
  };

  for (const file of sourceFiles) {
    const detection = detectionFor(file.language);
    const analysis = analysesByFile.get(file.path);
    if (detection === null || analysis === undefined) {
      continue;
    }
    for (const imported of analysis.imports) {
      const resolved = detection.analyzer.resolveImport(
        file.path,
        imported.specifier,
        fileSet,
      );
      if (resolved) {
        fileImports.push({
          from: file.path,
          to: resolved,
          specifier: imported.specifier,
        });
        addEdge({
          from: moduleSymbolId(file.path),
          to: moduleSymbolId(resolved),
          kind: 'imports',
          confidence: 'syntax',
        });

        const exports = exportedByFile.get(resolved);
        for (const binding of imported.bindings) {
          const target = exports?.get(binding.imported);
          if (target) {
            addEdge({
              from: moduleSymbolId(file.path),
              to: target,
              kind: 'references',
              confidence: 'import',
            });
          }
        }
        continue;
      }

      if (detection.analyzer.isExternal(imported.specifier)) {
        packageImports.push({
          from: file.path,
          packageName: detection.analyzer.packageName(imported.specifier),
          specifier: imported.specifier,
        });
      }
    }
  }

  const entryPointSet = new Set<string>();
  for (const analyzer of analyzers) {
    const analyzerFiles = sourceFiles.filter(
      (file) => detectionFor(file.language)?.analyzer === analyzer,
    );
    for (const entryPoint of analyzer.entryPoints({
      files: analyzerFiles,
      analyses: analysesByFile,
    })) {
      entryPointSet.add(entryPoint);
    }
  }
  const entryPoints = [...entryPointSet].toSorted();

  symbols.sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path);
    if (pathOrder !== 0) {
      return pathOrder;
    }
    const lineOrder = left.startLine - right.startLine;
    if (lineOrder !== 0) {
      return lineOrder;
    }
    return left.id.localeCompare(right.id);
  });

  return {
    symbols,
    graph: {
      fileImports: fileImports.toSorted((left, right) =>
        `${left.from}:${left.to}:${left.specifier}`.localeCompare(
          `${right.from}:${right.to}:${right.specifier}`,
        ),
      ),
      packageImports: packageImports.toSorted((left, right) =>
        `${left.from}:${left.packageName}:${left.specifier}`.localeCompare(
          `${right.from}:${right.packageName}:${right.specifier}`,
        ),
      ),
      edges: edges.toSorted((left, right) =>
        `${left.from}:${left.to}:${left.kind}`.localeCompare(
          `${right.from}:${right.to}:${right.kind}`,
        ),
      ),
      entryPoints,
    },
    warnings,
    cacheHits,
    cacheMisses,
    languageRuntimes,
    analyzers: contributingAnalyzers,
  };
}

/**
 * Reads the build manifests the brief needs. Only the fields the brief reports
 * are extracted; the raw manifest stays in the file manifest, so a tour can
 * anchor the manifest itself.
 */
function readManifests(
  files: FileEntry[],
  texts: Map<string, string>,
  analyzers: LanguageAnalyzer[],
): LanguageManifest[] {
  const manifests: LanguageManifest[] = [];
  for (const analyzer of analyzers) {
    if (analyzer.readManifest === undefined || analyzer.manifestNames.length === 0) {
      continue;
    }
    for (const file of files) {
      if (!analyzer.manifestNames.includes(path.posix.basename(file.path))) {
        continue;
      }
      const text = texts.get(file.path);
      if (text === undefined) {
        continue;
      }
      const manifest = analyzer.readManifest({ path: file.path, text });
      if (manifest) {
        manifests.push(manifest);
      }
    }
  }
  return manifests.toSorted((left, right) => left.path.localeCompare(right.path));
}

function readPrismaModels(files: FileEntry[], texts: Map<string, string>): PrismaModel[] {
  const models: PrismaModel[] = [];
  for (const file of files) {
    if (file.language !== 'prisma' && !file.path.endsWith('schema.prisma')) {
      continue;
    }
    const text = texts.get(file.path);
    if (text !== undefined) {
      models.push(...parsePrismaModels(text, file.path));
    }
  }
  return models.toSorted((left, right) => left.name.localeCompare(right.name));
}

export interface SnapshotParts {
  roots: {
    canonicalRoot: string;
    fingerprint: string;
    slug: string;
    name: string;
    packageName: string;
  };
  revision: ProjectRevision;
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

export function snapshotId(parts: SnapshotParts): string {
  const manifest = parts.files.map((file) => `${file.path}\u0000${file.hash}`).join('\n');
  const payload = [
    `analyzer:${ANALYZER_VERSION}`,
    `ignore:${IGNORE_VERSION}`,
    `fingerprint:${parts.roots.fingerprint}`,
    `commit:${parts.revision.commit ?? ''}`,
    `dirty:${parts.revision.dirty ? '1' : '0'}`,
    `manifest:${hashText(manifest)}`,
  ].join('\n');
  return `snapshot_${hashText(payload).slice('sha256:'.length, 'sha256:'.length + 16)}`;
}

/**
 * Reads a project into a deterministic, read-only snapshot. The snapshot stores
 * hashes, symbols, and relationships, never raw source, so it can be shared
 * without leaking the repository's contents.
 */
export async function analyzeProject(
  projectRoot: string,
  options: AnalyzeOptions = {},
): Promise<ProjectSnapshot> {
  const startedAt = Date.now();
  const root = await realpath(projectRoot);
  const fingerprint = hashText(root).slice('sha256:'.length, 'sha256:'.length + 16);

  const files: FileEntry[] = [];
  const warnings: AnalysisWarning[] = [];
  const texts = new Map<string, string>();
  const parseTexts = new Map<string, string>();

  const relativePaths = await listProjectFiles(root);
  for (const relativePath of relativePaths) {
    options.onProgress?.({ phase: 'read', path: relativePath });
    const { entry, text, parseText, warning } = await readProjectFile(root, relativePath);
    files.push(entry);
    if (warning) {
      warnings.push(warning);
    }
    if (text !== null) {
      texts.set(relativePath, text);
    } else if (parseText) {
      parseTexts.set(relativePath, parseText);
    }
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  warnings.sort((left, right) => left.path.localeCompare(right.path));

  const [packages, revision] = await Promise.all([
    readPackages(root),
    readRevision(root),
  ]);
  // Docs are read before parsing: an adapter only has to say which paths it
  // treats as documentation, not what the file contains.
  const docs = await readDocs(root, files, detectedAnalyzers(files));
  const sourceAnalysis = await buildSourceAnalysis(
    files,
    texts,
    parseTexts,
    options.cacheDirectory,
  );
  warnings.push(...sourceAnalysis.warnings);
  warnings.sort((left, right) => left.path.localeCompare(right.path));
  const prismaModels = readPrismaModels(files, texts);
  const manifests = readManifests(files, texts, sourceAnalysis.analyzers);

  const packageName =
    packages.find((entry) => entry.path === '')?.name ?? path.basename(root);
  const name = packageName.replace(/^@[^/]+\//, '');
  const slug = slugify(packageName);

  const analysis: AnalysisStats = {
    durationMs: Date.now() - startedAt,
    cacheHits: sourceAnalysis.cacheHits,
    cacheMisses: sourceAnalysis.cacheMisses,
    languageRuntimes: sourceAnalysis.languageRuntimes,
  };

  const languages = aggregateLanguages(files, primaryLanguage(files));

  const parts: SnapshotParts = {
    roots: { canonicalRoot: root, fingerprint, slug, name, packageName },
    revision,
    files,
    languages,
    packages,
    docs,
    prismaModels,
    manifests,
    symbols: sourceAnalysis.symbols,
    graph: sourceAnalysis.graph,
    warnings,
    analysis,
  };

  options.onProgress?.({ phase: 'done' });

  return {
    id: snapshotId(parts),
    project: { slug, name, fingerprint },
    revision,
    createdAt: new Date().toISOString(),
    analyzerVersion: ANALYZER_VERSION,
    ignoreVersion: IGNORE_VERSION,
    files,
    languages,
    packages,
    docs,
    prismaModels,
    manifests,
    symbols: sourceAnalysis.symbols,
    graph: sourceAnalysis.graph,
    warnings,
    analysis,
  };
}
