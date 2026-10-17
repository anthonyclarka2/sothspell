import type { Node } from 'web-tree-sitter';
import { readGoManifest } from '../manifests.js';
import type { LanguageAnalyzer } from '../port.js';
import { buildSymbol } from '../symbols.js';
import type { FileAnalysis, FileImport, SymbolNode } from '../types.js';
import {
  dropShadowedProperties,
  endLineOf,
  leadingComment,
  loadGrammar,
  parseWithGrammar,
  signatureOf,
  startLineOf,
  stringLiteralValue,
  stripComment,
  type GrammarRuntime,
} from './tree-sitter.js';

let grammar: GrammarRuntime | null = null;

/** Go's export rule: the identifier starts with an upper-case letter. */
function isGoExported(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function goTypeName(node: Node | null | undefined): string | null {
  if (!node) {
    return null;
  }
  if (node.type === 'pointer_type' || node.type === 'generic_type') {
    return goTypeName(node.namedChildren[0]);
  }
  return node.text;
}

function parseGoImports(node: Node, imports: FileImport[]): void {
  for (const spec of node.descendantsOfType('import_spec')) {
    if (!spec) {
      continue;
    }
    const pathNode = spec.childForFieldName('path');
    if (!pathNode) {
      continue;
    }
    const specifier = stringLiteralValue(pathNode);
    const last = specifier.split('/').pop() ?? specifier;
    const alias = spec.childForFieldName('name')?.text;
    imports.push({
      specifier,
      bindings: [{ imported: last, local: alias ?? last }],
    });
  }
}

function handleValueDeclaration(node: Node, path: string, symbols: SymbolNode[]): void {
  for (const spec of node.namedChildren) {
    if (!spec || (spec.type !== 'const_spec' && spec.type !== 'var_spec')) {
      continue;
    }
    for (const name of spec.childrenForFieldName('name')) {
      if (!name) {
        continue;
      }
      symbols.push(
        buildSymbol({
          path,
          language: 'go',
          kind: 'variable',
          name: name.text,
          qualifiedName: name.text,
          startLine: startLineOf(spec),
          endLine: endLineOf(spec),
          exported: isGoExported(name.text),
          parentId: null,
          decorators: [],
          signature: signatureOf(spec),
          documentation: leadingComment(spec, stripComment),
        }),
      );
    }
  }
}

function handleTypeDeclaration(
  node: Node,
  path: string,
  symbols: SymbolNode[],
  typeIds: Map<string, string>,
): void {
  for (const spec of node.namedChildren) {
    if (!spec) {
      continue;
    }
    const isAlias = spec.type === 'type_alias';
    if (spec.type !== 'type_spec' && !isAlias) {
      continue;
    }
    const name = spec.childForFieldName('name')?.text;
    if (!name) {
      continue;
    }
    const underlying = spec.childForFieldName('type');
    const kind =
      !isAlias && underlying?.type === 'struct_type'
        ? 'class'
        : !isAlias && underlying?.type === 'interface_type'
          ? 'interface'
          : 'type';
    const symbol = buildSymbol({
      path,
      language: 'go',
      kind,
      name,
      qualifiedName: name,
      startLine: startLineOf(spec),
      endLine: endLineOf(spec),
      exported: isGoExported(name),
      parentId: null,
      decorators: [],
      signature: signatureOf(spec),
      documentation: leadingComment(spec, stripComment),
    });
    symbols.push(symbol);
    typeIds.set(name, symbol.id);

    if (!underlying) {
      continue;
    }
    if (underlying.type === 'struct_type') {
      for (const field of underlying.descendantsOfType('field_declaration')) {
        if (!field) {
          continue;
        }
        for (const fieldName of field.childrenForFieldName('name')) {
          if (!fieldName) {
            continue;
          }
          symbols.push(
            buildSymbol({
              path,
              language: 'go',
              kind: 'property',
              name: fieldName.text,
              qualifiedName: `${name}.${fieldName.text}`,
              startLine: startLineOf(field),
              endLine: endLineOf(field),
              exported: isGoExported(fieldName.text),
              parentId: symbol.id,
              decorators: [],
              signature: signatureOf(field),
              documentation: leadingComment(field, stripComment),
            }),
          );
        }
      }
    }
    if (underlying.type === 'interface_type') {
      // Interface method specs are the interface's API, so they are symbols in
      // their own right; the tour can anchor one method instead of the whole type.
      for (const method of underlying.descendantsOfType('method_spec')) {
        if (!method) {
          continue;
        }
        const methodName = method.childForFieldName('name')?.text;
        if (!methodName) {
          continue;
        }
        symbols.push(
          buildSymbol({
            path,
            language: 'go',
            kind: 'method',
            name: methodName,
            qualifiedName: `${name}.${methodName}`,
            startLine: startLineOf(method),
            endLine: endLineOf(method),
            exported: isGoExported(methodName),
            parentId: symbol.id,
            decorators: [],
            signature: signatureOf(method),
            documentation: leadingComment(method, stripComment),
          }),
        );
      }
    }
  }
}

function parseGo(path: string, text: string): FileAnalysis {
  if (!grammar) {
    throw new Error('the go grammar is not loaded');
  }
  const lineCount = Math.max(1, text.split('\n').length);
  const symbols: SymbolNode[] = [
    buildSymbol({
      path,
      language: 'go',
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
  ];
  const imports: FileImport[] = [];
  const typeIds = new Map<string, string>();

  const parsed = parseWithGrammar(grammar, text);
  if (!parsed) {
    return {
      symbols,
      imports,
      exportedNames: [],
      parseErrors: ['the go parser returned no tree'],
      entryPoint: false,
    };
  }

  let packageName: string | null = null;
  let hasMainFunction = false;

  try {
    for (const node of parsed.root.namedChildren) {
      if (!node) {
        continue;
      }
      switch (node.type) {
        case 'package_clause':
          packageName = node.namedChildren[0]?.text ?? null;
          break;
        case 'import_declaration':
          parseGoImports(node, imports);
          break;
        case 'const_declaration':
        case 'var_declaration':
          handleValueDeclaration(node, path, symbols);
          break;
        case 'type_declaration':
          handleTypeDeclaration(node, path, symbols, typeIds);
          break;
        case 'function_declaration': {
          const name = node.childForFieldName('name')?.text;
          if (!name) {
            break;
          }
          if (name === 'main') {
            hasMainFunction = true;
          }
          symbols.push(
            buildSymbol({
              path,
              language: 'go',
              kind: 'function',
              name,
              qualifiedName: name,
              startLine: startLineOf(node),
              endLine: endLineOf(node),
              exported: isGoExported(name),
              parentId: null,
              decorators: [],
              signature: signatureOf(node),
              documentation: leadingComment(node, stripComment),
            }),
          );
          break;
        }
        case 'method_declaration': {
          const name = node.childForFieldName('name')?.text;
          const receiver = goTypeName(
            node
              .childForFieldName('receiver')
              ?.namedChildren[0]?.childForFieldName('type'),
          );
          if (!name || !receiver) {
            break;
          }
          symbols.push(
            buildSymbol({
              path,
              language: 'go',
              kind: 'method',
              name,
              qualifiedName: `${receiver}.${name}`,
              startLine: startLineOf(node),
              endLine: endLineOf(node),
              exported: isGoExported(name),
              parentId: typeIds.get(receiver) ?? null,
              decorators: [],
              signature: signatureOf(node),
              documentation: leadingComment(node, stripComment),
            }),
          );
          break;
        }
        default:
          break;
      }
    }
  } finally {
    parsed.tree.delete();
  }

  return {
    symbols: dropShadowedProperties(symbols),
    imports,
    exportedNames: symbols
      .filter((symbol) => symbol.kind !== 'module' && symbol.exported)
      .map((symbol) => symbol.qualifiedName),
    parseErrors: parsed.parseErrors,
    entryPoint: packageName === 'main' && hasMainFunction,
  };
}

export const goAnalyzer: LanguageAnalyzer = {
  id: 'go',
  displayName: 'Go',
  claims: [{ fileLanguage: 'go', language: 'go' }],
  requiresGrammar: true,
  risks: [
    'Imports are module paths, not files: every Go import becomes an external node.',
    'Build tags, generated code, and type inference are not evaluated.',
  ],
  async prepare() {
    grammar = await loadGrammar('go', 'go');
    return grammar.runtime;
  },
  parse({ path: filePath, text }) {
    return parseGo(filePath, text);
  },
  // Go import paths name packages, never files, so nothing resolves in-project.
  resolveImport: () => null,
  isExternal: () => true,
  packageName: (specifier) => specifier,
  entryPoints({ files, analyses }) {
    return files
      .map((file) => file.path)
      .filter((filePath) => analyses.get(filePath)?.entryPoint === true)
      .toSorted();
  },
  manifestNames: ['go.mod'],
  readManifest: readGoManifest,
};
