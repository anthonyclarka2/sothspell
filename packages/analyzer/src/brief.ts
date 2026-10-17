import { LANGUAGE_ANALYZERS, languageIdFor } from './languages/index.js';
import type {
  BriefApplication,
  FeatureModule,
  FileEntry,
  LanguageBrief,
  LanguageId,
  LanguageModule,
  NotableSymbol,
  ProjectBrief,
  ProjectSnapshot,
  SymbolNode,
} from './types.js';

function applicationKind(applicationPath: string): BriefApplication['kind'] {
  if (applicationPath.includes('browser') || applicationPath.includes('acceptance')) {
    return 'test';
  }
  if (applicationPath.endsWith('/api')) {
    return 'api';
  }
  if (applicationPath.endsWith('/web')) {
    return 'web';
  }
  return 'app';
}

function symbolPriority(symbol: SymbolNode): number {
  if (symbol.kind === 'class') return 0;
  if (symbol.kind === 'function') return 1;
  if (symbol.kind === 'interface' || symbol.kind === 'type') return 2;
  return 3;
}

function representativeSymbols(symbols: SymbolNode[]): string[] {
  return symbols
    .filter((symbol) => symbol.kind !== 'module' && symbol.exported)
    .toSorted((left, right) => {
      const priorityOrder = symbolPriority(left) - symbolPriority(right);
      return priorityOrder !== 0
        ? priorityOrder
        : left.qualifiedName.localeCompare(right.qualifiedName);
    })
    .slice(0, 6)
    .map((symbol) => symbol.qualifiedName);
}

function notableSymbols(symbols: SymbolNode[]): NotableSymbol[] {
  return symbols
    .filter((symbol) => symbol.kind !== 'module' && symbol.exported)
    .toSorted((left, right) => {
      const priorityOrder = symbolPriority(left) - symbolPriority(right);
      return priorityOrder !== 0
        ? priorityOrder
        : left.qualifiedName.localeCompare(right.qualifiedName);
    })
    .slice(0, 8)
    .map((symbol) => ({
      id: symbol.id,
      qualifiedName: symbol.qualifiedName,
      kind: symbol.kind,
      path: symbol.path,
    }));
}

/**
 * Directory prefixes that hold source code rather than a feature. They are
 * skipped when naming a module so the brief talks about `comments`, not `src`.
 */
const MODULE_CONTAINERS = new Set([
  'src',
  'lib',
  'app',
  'apps',
  'packages',
  'cmd',
  'internal',
  'pkg',
  'test',
  'tests',
  'java',
  'kotlin',
  'main',
  'resources',
]);

function moduleNameOf(file: FileEntry, language: LanguageId): string {
  const segments = file.path.split('/');
  const stem = (segments[segments.length - 1] ?? file.path).replace(/\.[^.]+$/, '');

  if (language === 'java') {
    // Java packages mirror directories, so the directory path is the package.
    const directory = segments
      .slice(0, -1)
      .filter((segment) => !MODULE_CONTAINERS.has(segment));
    return directory.length > 0 ? directory.join('.') : 'default';
  }

  if (language === 'rust') {
    const directory = segments.slice(0, -1);
    if (stem === 'main' || stem === 'lib') {
      return 'crate';
    }
    if (stem === 'mod') {
      return directory[directory.length - 1] ?? 'crate';
    }
    return directory.length > 0 && directory[0] === 'src'
      ? directory.slice(1).join('/') || stem
      : stem;
  }

  // Python, Go, TypeScript, JavaScript, and Svelte: the first meaningful
  // directory below the source root names the module.
  const meaningful = segments
    .slice(0, -1)
    .filter((segment) => !MODULE_CONTAINERS.has(segment));
  return meaningful[0] ?? stem;
}

function buildModules(
  files: FileEntry[],
  symbols: SymbolNode[],
  language: LanguageId,
): LanguageModule[] {
  const byName = new Map<string, FileEntry[]>();
  for (const file of files) {
    const name = moduleNameOf(file, language);
    const bucket = byName.get(name) ?? [];
    bucket.push(file);
    byName.set(name, bucket);
  }

  return [...byName.entries()]
    .map(([name, moduleFiles]) => {
      const moduleSymbols = symbols.filter((symbol) =>
        moduleFiles.some((file) => file.path === symbol.path),
      );
      const directory = moduleFiles[0]?.path.split('/').slice(0, -1).join('/') ?? '';
      return {
        name,
        path: directory.length > 0 ? directory : (moduleFiles[0]?.path ?? ''),
        files: moduleFiles.length,
        symbols: moduleSymbols.filter((symbol) => symbol.kind !== 'module').length,
        representativeSymbols: representativeSymbols(moduleSymbols),
      };
    })
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

/**
 * The per-language view of a snapshot: build system, entry points, module
 * layout, notable symbols, and the adapter's known limits. One entry per
 * detected language; the primary language is the one with the most source bytes.
 */
function buildLanguageBriefs(snapshot: ProjectSnapshot): LanguageBrief[] {
  const languageIds = new Set<LanguageId>();
  for (const stat of snapshot.languages) {
    const id = languageIdFor(stat.language);
    if (id) {
      languageIds.add(id);
    }
  }
  for (const manifest of snapshot.manifests ?? []) {
    languageIds.add(manifest.language);
  }

  const primary = snapshot.languages.find((entry) => entry.primary)?.id ?? null;

  return [...languageIds].toSorted().map((id) => {
    const stats = snapshot.languages.filter(
      (entry) => (languageIdFor(entry.language) ?? entry.language) === id,
    );
    const files = snapshot.files.filter((file) => languageIdFor(file.language) === id);
    const symbols = snapshot.symbols.filter((symbol) => symbol.language === id);
    const manifests = (snapshot.manifests ?? []).filter(
      (manifest) => manifest.language === id,
    );
    const filePaths = new Set(files.map((file) => file.path));
    const entryPoints = snapshot.graph.entryPoints.filter((entryPoint) =>
      filePaths.has(entryPoint),
    );
    const analyzer = LANGUAGE_ANALYZERS.find((candidate) => candidate.id === id);

    return {
      id,
      files: files.length,
      bytes: stats.reduce((total, entry) => total + entry.bytes, 0),
      lines: stats.reduce((total, entry) => total + entry.lines, 0),
      primary: id === primary,
      fileLanguages: [...new Set(files.map((file) => file.language))].toSorted(),
      buildSystems: [
        ...new Set(manifests.map((manifest) => manifest.buildSystem)),
      ].toSorted(),
      manifests: manifests.map((manifest) => manifest.path).toSorted(),
      entryPoints: [
        ...new Set([
          ...entryPoints,
          ...manifests.flatMap((manifest) => manifest.entryPoints),
        ]),
      ].toSorted(),
      modules: buildModules(files, symbols, id),
      notableSymbols: notableSymbols(symbols),
      risks: [...(analyzer?.risks ?? [])],
    };
  });
}

/**
 * Builds the deterministic, model-ready summary of a snapshot. The brief is
 * intentionally structural: it names the workspace, applications, modules,
 * languages, build systems, and graph shape without asking an LLM to invent any
 * of them.
 */
export function buildProjectBrief(snapshot: ProjectSnapshot): ProjectBrief {
  const packagePaths = new Set(snapshot.packages.map((entry) => entry.path));
  const hasWorkspaceFile = snapshot.files.some(
    (file) => file.path === 'pnpm-workspace.yaml',
  );

  const applications: BriefApplication[] = snapshot.packages
    .filter(
      (entry) => entry.path.startsWith('apps/') || entry.path.startsWith('packages/'),
    )
    .map((entry) => {
      const entryPoints = snapshot.graph.entryPoints.filter((filePath) =>
        entry.path === '' ? true : filePath.startsWith(`${entry.path}/`),
      );
      const symbols = snapshot.symbols.filter((symbol) =>
        symbol.path.startsWith(`${entry.path}/`),
      );
      return {
        name: entry.name,
        packageName: entry.name,
        path: entry.path,
        kind: applicationKind(entry.path),
        entryPoints,
        symbolCount: symbols.length,
      };
    })
    .toSorted((left, right) => left.path.localeCompare(right.path));

  const featureRoot = 'apps/api/src';
  const moduleNames = new Set<string>();
  for (const file of snapshot.files) {
    if (!file.path.startsWith(`${featureRoot}/`)) {
      continue;
    }
    const relative = file.path.slice(featureRoot.length + 1);
    const [moduleName] = relative.split('/');
    if (moduleName && relative.includes('/')) {
      moduleNames.add(moduleName);
    }
  }

  const featureModules: FeatureModule[] = [...moduleNames]
    .map((name) => {
      const modulePath = `${featureRoot}/${name}`;
      const symbols = snapshot.symbols.filter((symbol) =>
        symbol.path.startsWith(`${modulePath}/`),
      );
      return {
        name,
        path: modulePath,
        files: snapshot.files.filter((file) => file.path.startsWith(`${modulePath}/`))
          .length,
        symbols: symbols.filter((symbol) => symbol.kind !== 'module').length,
        representativeSymbols: representativeSymbols(symbols),
      };
    })
    .toSorted((left, right) => left.name.localeCompare(right.name));

  const docs = snapshot.docs.filter((doc) => doc.path.startsWith('docs/'));
  const plans = snapshot.docs.filter((doc) => doc.path.startsWith('plans/'));
  const references = snapshot.graph.edges.filter(
    (edge) => edge.kind === 'references',
  ).length;

  return {
    project: snapshot.project,
    revision: snapshot.revision,
    workspace: {
      kind: hasWorkspaceFile || packagePaths.size > 1 ? 'pnpm' : 'single',
      packages: snapshot.packages,
    },
    languages: snapshot.languages,
    languageBriefs: buildLanguageBriefs(snapshot),
    applications,
    featureModules,
    docs,
    plans,
    prismaModels: snapshot.prismaModels.map((model) => ({
      name: model.name,
      path: model.path,
      fields: model.fields.length,
    })),
    graphStats: {
      files: snapshot.files.length,
      symbols: snapshot.symbols.length,
      fileImports: snapshot.graph.fileImports.length,
      packageImports: snapshot.graph.packageImports.length,
      references,
      entryPoints: snapshot.graph.entryPoints,
    },
  };
}

function renderLanguageBrief(language: LanguageBrief): string[] {
  const lines: string[] = [];
  lines.push(`### ${language.id}${language.primary ? ' (primary)' : ''}`);
  lines.push('');
  lines.push(
    `- Files: ${language.files} (${language.fileLanguages.join(', ') || 'none'})`,
  );
  if (language.buildSystems.length > 0) {
    lines.push(
      `- Build: ${language.buildSystems.join(', ')} (${language.manifests.join(', ')})`,
    );
  }
  if (language.entryPoints.length > 0) {
    lines.push(`- Entry points: ${language.entryPoints.join(', ')}`);
  }
  if (language.modules.length > 0) {
    lines.push(
      `- Modules: ${language.modules
        .map((module) => `${module.name} (${module.files} files)`)
        .join(', ')}`,
    );
  }
  if (language.notableSymbols.length > 0) {
    lines.push(
      `- Notable symbols: ${language.notableSymbols
        .map((symbol) => symbol.qualifiedName)
        .join(', ')}`,
    );
  }
  for (const risk of language.risks) {
    lines.push(`- Limit: ${risk}`);
  }
  return lines;
}

export function renderProjectBriefMarkdown(brief: ProjectBrief): string {
  const lines: string[] = [];
  lines.push(`# ${brief.project.name}`);
  lines.push('');
  lines.push(
    `Revision: ${brief.revision.commit ?? 'not a git checkout'}${brief.revision.dirty ? ' (dirty)' : ''}`,
  );
  lines.push(`Workspace: ${brief.workspace.kind}`);
  lines.push('');

  lines.push('## Languages');
  lines.push('');
  for (const language of brief.languages) {
    lines.push(
      `- ${language.language}: ${language.files} files, ${language.lines} lines`,
    );
  }
  lines.push('');

  lines.push('## Language briefs');
  lines.push('');
  for (const language of brief.languageBriefs) {
    lines.push(...renderLanguageBrief(language));
    lines.push('');
  }

  lines.push('## Applications');
  lines.push('');
  for (const application of brief.applications) {
    lines.push(
      `- ${application.path} (${application.packageName}) — ${application.symbolCount} symbols`,
    );
    if (application.entryPoints.length > 0) {
      lines.push(`  Entry points: ${application.entryPoints.join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Feature modules');
  lines.push('');
  for (const module of brief.featureModules) {
    lines.push(`- ${module.name}: ${module.files} files, ${module.symbols} symbols`);
    if (module.representativeSymbols.length > 0) {
      lines.push(`  Representatives: ${module.representativeSymbols.join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Docs and plans');
  lines.push('');
  for (const doc of brief.docs) {
    lines.push(`- ${doc.path}: ${doc.title}`);
  }
  for (const plan of brief.plans) {
    lines.push(`- ${plan.path}: ${plan.title}`);
  }
  lines.push('');

  lines.push('## Graph');
  lines.push('');
  lines.push(`- Files: ${brief.graphStats.files}`);
  lines.push(`- Symbols: ${brief.graphStats.symbols}`);
  lines.push(`- File imports: ${brief.graphStats.fileImports}`);
  lines.push(`- Package imports: ${brief.graphStats.packageImports}`);
  lines.push(`- Reference edges: ${brief.graphStats.references}`);
  lines.push(`- Entry points: ${brief.graphStats.entryPoints.join(', ')}`);

  return `${lines.join('\n')}\n`;
}
