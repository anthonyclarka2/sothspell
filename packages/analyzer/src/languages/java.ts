import type { Node } from 'web-tree-sitter';
import { readGradleManifest, readMavenManifest } from '../manifests.js';
import type { LanguageAnalyzer } from '../port.js';
import { buildSymbol } from '../symbols.js';
import type {
  FileAnalysis,
  FileImport,
  SymbolDecorator,
  SymbolKind,
  SymbolNode,
} from '../types.js';
import {
  dropShadowedProperties,
  endLineOf,
  hasModifier,
  leadingComment,
  loadGrammar,
  parseWithGrammar,
  signatureFromText,
  startLineOf,
  stripComment,
  type GrammarRuntime,
} from './tree-sitter.js';

let grammar: GrammarRuntime | null = null;

interface JavaContext {
  path: string;
  symbols: SymbolNode[];
  imports: FileImport[];
  entryPoint: boolean;
}

interface JavaContainer {
  id: string;
  qualifiedName: string;
  /** Interface members are public even without a modifier. */
  implicitlyPublic: boolean;
}

const TYPE_DECLARATIONS: Record<string, SymbolKind> = {
  class_declaration: 'class',
  interface_declaration: 'interface',
  annotation_type_declaration: 'interface',
  enum_declaration: 'enum',
  record_declaration: 'class',
};

function modifiersOf(node: Node): Node | null {
  return node.namedChildren.find((child) => child?.type === 'modifiers') ?? null;
}

/** The declaration text without its annotations and modifiers. */
function unmodifiedText(node: Node): string {
  const modifiers = modifiersOf(node);
  if (!modifiers) {
    return node.text;
  }
  return node.text.slice(modifiers.endIndex - node.startIndex).trim();
}

function annotationsOf(node: Node): SymbolDecorator[] {
  const modifiers = modifiersOf(node);
  const decorators: SymbolDecorator[] = [];
  for (const child of modifiers?.namedChildren ?? []) {
    if (!child || (child.type !== 'marker_annotation' && child.type !== 'annotation')) {
      continue;
    }
    const name = child.childForFieldName('name')?.text;
    if (!name) {
      continue;
    }
    const argument = child.namedChildren.find(
      (entry) => entry?.type === 'annotation_argument_list',
    )?.namedChildren[0];
    decorators.push({
      name,
      argument: argument ? argument.text.slice(0, 120) : null,
    });
  }
  return decorators;
}

function isExported(node: Node, container: JavaContainer | null): boolean {
  return hasModifier(modifiersOf(node), 'public') || container?.implicitlyPublic === true;
}

/** The parameter type list, used to keep Java overloads apart. */
function parameterTypes(node: Node): string {
  const parameters = node.childForFieldName('parameters');
  if (!parameters) {
    return '';
  }
  return parameters.namedChildren
    .filter((child) => child?.type === 'formal_parameter')
    .map((child) => child?.childForFieldName('type')?.text ?? '')
    .join(', ');
}

/**
 * Java allows overloads, so a type that declares one name twice qualifies each
 * declaration with its parameter types: `Greeter.greet(String)`.
 */
function memberNames(body: Node): Map<string, number> {
  const counts = new Map<string, number>();
  for (const member of body.namedChildren) {
    if (!member) {
      continue;
    }
    if (
      member.type !== 'method_declaration' &&
      member.type !== 'constructor_declaration'
    ) {
      continue;
    }
    const name =
      member.type === 'constructor_declaration'
        ? 'constructor'
        : (member.childForFieldName('name')?.text ?? '');
    if (name.length > 0) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

function memberQualifiedName(
  container: JavaContainer,
  name: string,
  node: Node,
  overloads: Map<string, number>,
): string {
  const base = `${container.qualifiedName}.${name}`;
  return (overloads.get(name) ?? 0) > 1 ? `${base}(${parameterTypes(node)})` : base;
}

function handleMember(
  ctx: JavaContext,
  node: Node,
  container: JavaContainer,
  overloads: Map<string, number>,
): void {
  switch (node.type) {
    case 'method_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (!name) {
        return;
      }
      if (
        name === 'main' &&
        hasModifier(modifiersOf(node), 'static') &&
        container.qualifiedName.length > 0
      ) {
        ctx.entryPoint = true;
      }
      ctx.symbols.push(
        buildSymbol({
          path: ctx.path,
          language: 'java',
          kind: 'method',
          name,
          qualifiedName: memberQualifiedName(container, name, node, overloads),
          startLine: startLineOf(node),
          endLine: endLineOf(node),
          exported: isExported(node, container),
          parentId: container.id,
          decorators: annotationsOf(node),
          signature: signatureFromText(unmodifiedText(node)),
          documentation: leadingComment(node, stripComment),
        }),
      );
      return;
    }
    case 'constructor_declaration': {
      // The unified symbol model calls constructors `constructor`, the same
      // name the TypeScript adapter uses.
      const name = 'constructor';
      ctx.symbols.push(
        buildSymbol({
          path: ctx.path,
          language: 'java',
          kind: 'method',
          name,
          qualifiedName: memberQualifiedName(container, name, node, overloads),
          startLine: startLineOf(node),
          endLine: endLineOf(node),
          exported: isExported(node, container),
          parentId: container.id,
          decorators: annotationsOf(node),
          signature: signatureFromText(unmodifiedText(node)),
          documentation: leadingComment(node, stripComment),
        }),
      );
      return;
    }
    case 'field_declaration': {
      for (const declarator of node.childrenForFieldName('declarator')) {
        const name = declarator?.childForFieldName('name')?.text;
        if (!name) {
          continue;
        }
        ctx.symbols.push(
          buildSymbol({
            path: ctx.path,
            language: 'java',
            kind: 'property',
            name,
            qualifiedName: `${container.qualifiedName}.${name}`,
            startLine: startLineOf(node),
            endLine: endLineOf(node),
            exported: isExported(node, container),
            parentId: container.id,
            decorators: annotationsOf(node),
            signature: signatureFromText(unmodifiedText(node)),
            documentation: leadingComment(node, stripComment),
          }),
        );
      }
      return;
    }
    case 'annotation_type_element_declaration': {
      const name = node.childForFieldName('name')?.text;
      if (!name) {
        return;
      }
      ctx.symbols.push(
        buildSymbol({
          path: ctx.path,
          language: 'java',
          kind: 'method',
          name,
          qualifiedName: memberQualifiedName(container, name, node, overloads),
          startLine: startLineOf(node),
          endLine: endLineOf(node),
          exported: true,
          parentId: container.id,
          decorators: annotationsOf(node),
          signature: signatureFromText(unmodifiedText(node)),
          documentation: leadingComment(node, stripComment),
        }),
      );
      return;
    }
    case 'class_declaration':
    case 'interface_declaration':
    case 'annotation_type_declaration':
    case 'enum_declaration':
    case 'record_declaration':
      handleType(ctx, node, container);
      return;
    default:
      return;
  }
}

function handleType(ctx: JavaContext, node: Node, container: JavaContainer | null): void {
  const kind = TYPE_DECLARATIONS[node.type];
  const name = node.childForFieldName('name')?.text;
  if (!kind || !name) {
    return;
  }
  const qualifiedName = container ? `${container.qualifiedName}.${name}` : name;
  const symbol = buildSymbol({
    path: ctx.path,
    language: 'java',
    kind,
    name,
    qualifiedName,
    startLine: startLineOf(node),
    endLine: endLineOf(node),
    exported: isExported(node, container),
    parentId: container?.id ?? null,
    decorators: annotationsOf(node),
    signature: signatureFromText(unmodifiedText(node)),
    documentation: leadingComment(node, stripComment),
  });
  ctx.symbols.push(symbol);

  const body = node.childForFieldName('body');
  if (!body) {
    return;
  }
  const memberContainer: JavaContainer = {
    id: symbol.id,
    qualifiedName,
    implicitlyPublic: kind === 'interface' || container?.implicitlyPublic === true,
  };
  const overloads = memberNames(body);
  for (const member of body.namedChildren) {
    if (member) {
      handleMember(ctx, member, memberContainer, overloads);
    }
  }
}

function parseJava(path: string, text: string): FileAnalysis {
  if (!grammar) {
    throw new Error('the java grammar is not loaded');
  }
  const lineCount = Math.max(1, text.split('\n').length);
  const ctx: JavaContext = {
    path,
    symbols: [
      buildSymbol({
        path,
        language: 'java',
        kind: 'module',
        name: path.split('/').pop() ?? path,
        qualifiedName: '',
        startLine: 1,
        endLine: lineCount,
        exported: true,
        parentId: null,
        decorators: [],
        signature: `module ${path}`,
      }),
    ],
    imports: [],
    entryPoint: false,
  };

  const parsed = parseWithGrammar(grammar, text);
  if (!parsed) {
    return {
      symbols: ctx.symbols,
      imports: ctx.imports,
      exportedNames: [],
      parseErrors: ['the java parser returned no tree'],
      entryPoint: false,
    };
  }

  try {
    for (const node of parsed.root.namedChildren) {
      if (!node) {
        continue;
      }
      if (node.type === 'import_declaration') {
        const target = node.namedChildren.find(
          (child) => child?.type === 'scoped_identifier',
        );
        if (!target) {
          continue;
        }
        const specifier = target.text;
        const wildcard = node.namedChildren.some((child) => child?.type === 'asterisk');
        const imported = specifier.split('.').pop() ?? specifier;
        ctx.imports.push({
          specifier,
          bindings: wildcard ? [] : [{ imported, local: imported }],
        });
        continue;
      }
      if (TYPE_DECLARATIONS[node.type]) {
        handleType(ctx, node, null);
      }
    }
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
 * Resolves a Java import to a source file: packages mirror directories, so
 * `com.example.store.Store` is `com/example/store/Store.java` under a source
 * root. Wildcard and static imports stay external.
 */
export function resolveJavaImport(
  fromPath: string,
  specifier: string,
  fileSet: ReadonlySet<string>,
): string | null {
  if (specifier.endsWith('.*') || specifier.split('.').length < 2) {
    return null;
  }
  const relative = `${specifier.split('.').join('/')}.java`;
  const roots = ['', 'src/main/java', 'src/test/java', 'src'];
  for (const root of roots) {
    const candidate = root.length > 0 ? `${root}/${relative}` : relative;
    if (fileSet.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

export const javaAnalyzer: LanguageAnalyzer = {
  id: 'java',
  displayName: 'Java',
  claims: [{ fileLanguage: 'java', language: 'java' }],
  requiresGrammar: true,
  risks: [
    'Annotations and generated sources are not expanded; symbols come from the parsed file.',
    'Imports resolve to a source file when the package matches a path, otherwise they become external nodes.',
  ],
  async prepare() {
    grammar = await loadGrammar('java', 'java');
    return grammar.runtime;
  },
  parse({ path: filePath, text }) {
    return parseJava(filePath, text);
  },
  resolveImport: resolveJavaImport,
  isExternal: () => true,
  packageName: (specifier) => {
    const segments = specifier.split('.');
    return segments.length > 1 ? segments.slice(0, -1).join('.') : specifier;
  },
  entryPoints({ files, analyses }) {
    return files
      .map((file) => file.path)
      .filter((filePath) => analyses.get(filePath)?.entryPoint === true)
      .toSorted();
  },
  manifestNames: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  readManifest: (input) =>
    input.path.endsWith('.xml') ? readMavenManifest(input) : readGradleManifest(input),
};
