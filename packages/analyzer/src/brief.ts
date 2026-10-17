import type {
  BriefApplication,
  FeatureModule,
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

/**
 * Builds the deterministic, model-ready summary of a snapshot. The brief is
 * intentionally structural: it names the workspace, applications, modules,
 * docs, and graph shape without asking an LLM to invent any of them.
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
