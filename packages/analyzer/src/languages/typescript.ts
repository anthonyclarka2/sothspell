import path from 'node:path';
import { analyzeSourceFile } from '../symbols.js';
import type { LanguageAnalyzer } from '../port.js';

/**
 * Resolves a relative ESM specifier to a project file. TypeScript source often
 * writes `./store.js` while the file on disk is `store.ts`; the runtime
 * extension is a hint, not a literal path.
 */
export function resolveTypeScriptImport(
  fromPath: string,
  specifier: string,
  fileSet: ReadonlySet<string>,
): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }
  const base = path.posix.normalize(
    path.posix.join(path.posix.dirname(fromPath), specifier),
  );
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
  ];

  const extension = path.posix.extname(base);
  if (extension === '.js' || extension === '.jsx') {
    const withoutExtension = base.slice(0, -extension.length);
    candidates.push(
      `${withoutExtension}.ts`,
      `${withoutExtension}.tsx`,
      `${withoutExtension}.jsx`,
    );
  } else if (extension === '.mjs') {
    candidates.push(`${base.slice(0, -4)}.mts`, `${base.slice(0, -4)}.ts`);
  }

  return candidates.find((candidate) => fileSet.has(candidate)) ?? null;
}

/** The package a bare specifier belongs to: `@scope/name` or the first segment. */
export function typescriptPackageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@')
    ? parts.slice(0, 2).join('/')
    : (parts[0] ?? specifier);
}

/** v1 entry point rule: a `src/main|index` module or a root-level one. */
function isTypeScriptEntryPoint(filePath: string): boolean {
  return (
    /(^|\/)(?:src\/)?(?:main|index)\.(?:ts|tsx|js|jsx|mjs)$/.test(filePath) &&
    (/(^|\/)src\/(?:main|index)\./.test(filePath) || /^(?:main|index)\./.test(filePath))
  );
}

export const typescriptAnalyzer: LanguageAnalyzer = {
  id: 'typescript',
  displayName: 'TypeScript and JavaScript',
  claims: [
    { fileLanguage: 'typescript', language: 'typescript' },
    { fileLanguage: 'tsx', language: 'typescript' },
    { fileLanguage: 'javascript', language: 'javascript' },
    { fileLanguage: 'jsx', language: 'javascript' },
    { fileLanguage: 'svelte', language: 'svelte' },
  ],
  requiresGrammar: false,
  risks: [
    'Types are erased before parsing; the analyzer never uses the TypeScript compiler API.',
    'Svelte components are indexed as modules; their script blocks are not parsed.',
  ],
  parse({ path: filePath, text, fileLanguage, language }) {
    return analyzeSourceFile(filePath, text, fileLanguage, language);
  },
  resolveImport: resolveTypeScriptImport,
  isExternal: (specifier) => !specifier.startsWith('.') && !specifier.startsWith('/'),
  packageName: typescriptPackageName,
  entryPoints({ files }) {
    return files
      .map((file) => file.path)
      .filter((filePath) => isTypeScriptEntryPoint(filePath))
      .toSorted();
  },
  manifestNames: [],
};
