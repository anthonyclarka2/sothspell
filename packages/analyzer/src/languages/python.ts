import path from 'node:path';
import type { Node } from 'web-tree-sitter';
import { readPythonManifest } from '../manifests.js';
import type { LanguageAnalyzer } from '../port.js';
import { buildSymbol } from '../symbols.js';
import type {
  FileAnalysis,
  FileImport,
  ImportBinding,
  SymbolDecorator,
  SymbolNode,
} from '../types.js';
import {
  dropShadowedProperties,
  endLineOf,
  loadGrammar,
  parseWithGrammar,
  signatureOf,
  startLineOf,
  stringLiteralValue,
  type GrammarRuntime,
} from './tree-sitter.js';

let grammar: GrammarRuntime | null = null;

interface PythonContext {
  path: string;
  symbols: SymbolNode[];
  imports: FileImport[];
  /** `__all__`, when the module declares one; null means the naming convention applies. */
  allowed: Set<string> | null;
  entryPoint: boolean;
}

interface PythonContainer {
  id: string;
  qualifiedName: string;
  kind: 'class' | 'function';
}

function qualifiedNameOf(container: PythonContainer | null, name: string): string {
  return container ? `${container.qualifiedName}.${name}` : name;
}

/** Python's export rule: `__all__` wins, otherwise a leading underscore is private. */
function isExported(ctx: PythonContext, name: string): boolean {
  if (ctx.allowed) {
    return ctx.allowed.has(name);
  }
  return !name.startsWith('_');
}

/** Docstrings may be triple-quoted and carry a `r`/`f`/`b` prefix. */
function docstringText(node: Node): string {
  return stringLiteralValue(node)
    .replace(/^[rbfuRBFU]{0,2}/, '')
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

function decoratorsOf(node: Node): SymbolDecorator[] {
  const decorators: SymbolDecorator[] = [];
  for (const child of node.namedChildren) {
    if (child?.type !== 'decorator') {
      continue;
    }
    const expression = child.namedChildren[0];
    if (!expression) {
      decorators.push({ name: child.text.replace(/^@/, ''), argument: null });
      continue;
    }
    if (expression.type === 'call') {
      const callee = expression.childForFieldName('function');
      const args = expression.childForFieldName('arguments');
      const first = args?.namedChildren[0];
      decorators.push({
        name: callee?.text ?? expression.text,
        argument: first?.type === 'string' ? stringLiteralValue(first) : null,
      });
      continue;
    }
    decorators.push({ name: expression.text, argument: null });
  }
  return decorators;
}

/** The docstring is the first string statement of a class or function body. */
function docstringOf(definition: Node): string | null {
  const body = definition.childForFieldName('body');
  const first = body?.namedChildren[0];
  if (first?.type !== 'expression_statement') {
    return null;
  }
  const string = first.namedChildren[0];
  if (string?.type !== 'string') {
    return null;
  }
  const content = docstringText(string);
  return content.length > 0 ? content.slice(0, 240) : null;
}

function isMainGuard(node: Node): boolean {
  const condition = node.childForFieldName('condition');
  if (!condition) {
    return false;
  }
  return /__name__\s*==\s*['"]__main__['"]/.test(condition.text);
}

function readAll(ctx: PythonContext, assignment: Node): void {
  const right = assignment.childForFieldName('right');
  if (!right || right.type !== 'list') {
    return;
  }
  const allowed = new Set<string>();
  for (const element of right.namedChildren) {
    if (element?.type === 'string') {
      allowed.add(stringLiteralValue(element));
    }
  }
  ctx.allowed = allowed;
}

function handleImport(ctx: PythonContext, node: Node): void {
  if (node.type === 'import_statement') {
    for (const name of node.childrenForFieldName('name')) {
      if (!name) {
        continue;
      }
      const dotted =
        name.type === 'aliased_import' ? name.childForFieldName('name') : name;
      if (!dotted) {
        continue;
      }
      const specifier = dotted.text;
      const last = specifier.split('.').pop() ?? specifier;
      const alias =
        name.type === 'aliased_import' ? name.childForFieldName('alias') : null;
      ctx.imports.push({
        specifier,
        bindings: [{ imported: last, local: alias?.text ?? last }],
      });
    }
    return;
  }

  if (node.type !== 'import_from_statement') {
    return;
  }
  const module = node.childForFieldName('module_name');
  if (!module) {
    return;
  }
  const bindings: ImportBinding[] = [];
  for (const name of node.childrenForFieldName('name')) {
    if (!name) {
      continue;
    }
    const dotted = name.type === 'aliased_import' ? name.childForFieldName('name') : name;
    if (!dotted) {
      continue;
    }
    const alias = name.type === 'aliased_import' ? name.childForFieldName('alias') : null;
    bindings.push({ imported: dotted.text, local: alias?.text ?? dotted.text });
  }
  ctx.imports.push({ specifier: module.text, bindings });
}

function handleAssignment(
  ctx: PythonContext,
  statement: Node,
  container: PythonContainer | null,
): void {
  // Locals inside a function body are noise for a tour: module and class
  // attributes are the anchorable declarations.
  if (container?.kind === 'function') {
    return;
  }
  const assignment = statement.namedChildren[0];
  if (assignment?.type !== 'assignment') {
    return;
  }
  const left = assignment.childForFieldName('left');
  if (left?.type !== 'identifier') {
    return;
  }
  if (left.text === '__all__' && container === null) {
    readAll(ctx, assignment);
    return;
  }
  const name = left.text;
  ctx.symbols.push(
    buildSymbol({
      path: ctx.path,
      language: 'python',
      kind: container?.kind === 'class' ? 'property' : 'variable',
      name,
      qualifiedName: qualifiedNameOf(container, name),
      startLine: startLineOf(statement),
      endLine: endLineOf(statement),
      exported: container === null && isExported(ctx, name),
      parentId: container?.id ?? null,
      decorators: [],
      signature: signatureOf(statement),
    }),
  );
}

function handleDefinition(
  ctx: PythonContext,
  node: Node,
  decorators: SymbolDecorator[],
  container: PythonContainer | null,
): void {
  const name = node.childForFieldName('name')?.text;
  if (!name) {
    return;
  }
  const body = node.childForFieldName('body');
  const qualifiedName = qualifiedNameOf(container, name);

  if (node.type === 'class_definition') {
    const symbol = buildSymbol({
      path: ctx.path,
      language: 'python',
      kind: 'class',
      name,
      qualifiedName,
      startLine: startLineOf(node),
      endLine: endLineOf(node),
      exported: container === null && isExported(ctx, name),
      parentId: container?.id ?? null,
      decorators,
      signature: signatureOf(node),
      documentation: docstringOf(node),
    });
    ctx.symbols.push(symbol);
    if (body) {
      walkBody(ctx, body, { id: symbol.id, qualifiedName, kind: 'class' });
    }
    return;
  }

  if (node.type !== 'function_definition') {
    return;
  }
  // `@property` marks a method that reads like an attribute; the symbol model
  // already has that kind, so the decorator is not lost information.
  const kind = decorators.some((entry) => entry.name === 'property')
    ? 'property'
    : container?.kind === 'class'
      ? 'method'
      : 'function';
  const symbol = buildSymbol({
    path: ctx.path,
    language: 'python',
    kind,
    name,
    qualifiedName,
    startLine: startLineOf(node),
    endLine: endLineOf(node),
    exported: container === null && isExported(ctx, name),
    parentId: container?.id ?? null,
    decorators,
    signature: signatureOf(node),
    documentation: docstringOf(node),
  });
  ctx.symbols.push(symbol);
  if (body) {
    walkBody(ctx, body, { id: symbol.id, qualifiedName, kind: 'function' });
  }
}

function walkBody(
  ctx: PythonContext,
  body: Node,
  container: PythonContainer | null,
): void {
  for (const child of body.namedChildren) {
    if (!child) {
      continue;
    }
    switch (child.type) {
      case 'decorated_definition': {
        const definition = child.childForFieldName('definition');
        if (definition) {
          handleDefinition(ctx, definition, decoratorsOf(child), container);
        }
        break;
      }
      case 'class_definition':
      case 'function_definition':
        handleDefinition(ctx, child, [], container);
        break;
      case 'if_statement':
        if (container === null && isMainGuard(child)) {
          ctx.entryPoint = true;
        }
        break;
      case 'expression_statement':
        handleAssignment(ctx, child, container);
        break;
      case 'import_statement':
      case 'import_from_statement':
        handleImport(ctx, child);
        break;
      default:
        break;
    }
  }
}

function parsePython(filePath: string, text: string): FileAnalysis {
  if (!grammar) {
    throw new Error('the python grammar is not loaded');
  }
  const lineCount = Math.max(1, text.split('\n').length);
  const moduleSymbol = buildSymbol({
    path: filePath,
    language: 'python',
    kind: 'module',
    name: filePath.split('/').pop() ?? filePath,
    qualifiedName: '',
    startLine: 1,
    endLine: lineCount,
    exported: true,
    parentId: null,
    decorators: [],
    signature: `module ${filePath}`,
  });

  const parsed = parseWithGrammar(grammar, text);
  if (!parsed) {
    return {
      symbols: [moduleSymbol],
      imports: [],
      exportedNames: [],
      parseErrors: ['the python parser returned no tree'],
      entryPoint: false,
    };
  }

  const ctx: PythonContext = {
    path: filePath,
    symbols: [moduleSymbol],
    imports: [],
    allowed: null,
    entryPoint: false,
  };
  try {
    walkBody(ctx, parsed.root, null);
  } finally {
    parsed.tree.delete();
  }

  return {
    symbols: dropShadowedProperties(ctx.symbols),
    imports: ctx.imports,
    exportedNames: ctx.symbols
      .filter((symbol) => symbol.kind !== 'module' && symbol.exported)
      .map((symbol) => symbol.qualifiedName),
    parseErrors: parsed.parseErrors,
    entryPoint: ctx.entryPoint,
  };
}

/**
 * Resolves Python imports the way the interpreter would look for a file:
 * relative imports walk up from the current package, absolute imports try the
 * project root and the common `src`/`lib` source roots. A miss is normal.
 */
export function resolvePythonImport(
  fromPath: string,
  specifier: string,
  fileSet: ReadonlySet<string>,
): string | null {
  const relativeMatch = /^(\.+)(.*)$/.exec(specifier);
  const fromDirectory = path.posix.dirname(fromPath);
  const prefix = relativeMatch?.[1] ?? '';
  const remainder = relativeMatch?.[2] ?? specifier;
  const segments = remainder.split('.').filter(Boolean);

  const roots: string[] = [];
  if (prefix.length > 0) {
    let directory = fromDirectory;
    for (let level = 1; level < prefix.length; level += 1) {
      directory = path.posix.dirname(directory);
    }
    roots.push(directory);
  } else {
    roots.push('', 'src', 'lib');
  }

  for (const root of roots) {
    const target = path.posix.join(root, ...segments);
    const candidates = [`${target}.py`, `${target}/__init__.py`, `${target}.pyi`];
    const resolved = candidates.find((candidate) => fileSet.has(candidate));
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

export const pythonAnalyzer: LanguageAnalyzer = {
  id: 'python',
  displayName: 'Python',
  claims: [{ fileLanguage: 'python', language: 'python' }],
  requiresGrammar: true,
  risks: [
    'Dynamic imports and runtime patching are not executed; symbols come from syntax only.',
    'Absolute imports resolve to a project file when the dotted path matches one, otherwise they become external nodes.',
  ],
  async prepare() {
    grammar = await loadGrammar('python', 'python');
    return grammar.runtime;
  },
  parse({ path: filePath, text }) {
    return parsePython(filePath, text);
  },
  resolveImport: resolvePythonImport,
  isExternal: (specifier) => !specifier.startsWith('.'),
  packageName: (specifier) => {
    const first = specifier.replace(/^\.+/, '').split('.')[0];
    return first && first.length > 0 ? first : specifier;
  },
  entryPoints({ files, analyses }) {
    const entryPoints = new Set<string>();
    for (const file of files) {
      if (/(^|\/)__main__\.py$/.test(file.path)) {
        entryPoints.add(file.path);
      }
      if (analyses.get(file.path)?.entryPoint) {
        entryPoints.add(file.path);
      }
    }
    return [...entryPoints].toSorted();
  },
  manifestNames: ['pyproject.toml', 'requirements.txt'],
  readManifest: readPythonManifest,
  matchesDoc: (filePath) => filePath.endsWith('.rst'),
};
