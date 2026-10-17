import { parseSync, type Node } from 'oxc-parser';
import { walk } from 'oxc-walker';
import type {
  FileAnalysis,
  FileImport,
  FileLanguage,
  ImportBinding,
  LanguageId,
  SymbolDecorator,
  SymbolKind,
  SymbolNode,
} from './types.js';

function lineStartsOf(buffer: Buffer): number[] {
  const starts = [0];
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineAt(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const value = starts[middle] ?? 0;
    if (value <= offset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return Math.max(1, high + 1);
}

function nodeName(node: Node | null | undefined): string | null {
  if (!node) {
    return null;
  }
  switch (node.type) {
    case 'Identifier':
    case 'PrivateIdentifier':
      return node.name;
    case 'Literal':
      return typeof node.value === 'string' ? node.value : null;
    default:
      return null;
  }
}

function decoratorsOf(node: {
  decorators?: Array<{
    expression: Node;
  }>;
}): SymbolDecorator[] {
  const decorators: SymbolDecorator[] = [];
  for (const decorator of node.decorators ?? []) {
    const expression = decorator.expression;
    if (expression.type === 'Identifier') {
      decorators.push({ name: expression.name, argument: null });
      continue;
    }
    if (expression.type === 'CallExpression') {
      const callee = expression.callee;
      const name =
        callee.type === 'Identifier'
          ? callee.name
          : callee.type === 'MemberExpression'
            ? 'member'
            : 'call';
      const first = expression.arguments[0];
      const argument =
        first && first.type === 'Literal' && typeof first.value === 'string'
          ? first.value
          : null;
      decorators.push({ name, argument });
    }
  }
  return decorators;
}

function signatureOf(buffer: Buffer, node: Node): string {
  const end = Math.min(node.end, node.start + 240);
  const raw = buffer.subarray(node.start, end).toString('utf8');
  const firstLine = raw.split('\n')[0] ?? '';
  return firstLine.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function symbolId(path: string, qualifiedName: string): string {
  return qualifiedName.length === 0
    ? `symbol:${path}`
    : `symbol:${path}#${qualifiedName}`;
}

export function buildSymbol(input: {
  path: string;
  language: LanguageId;
  kind: SymbolKind;
  name: string;
  qualifiedName: string;
  startLine: number;
  endLine: number;
  exported: boolean;
  parentId: string | null;
  decorators: SymbolDecorator[];
  signature: string;
  documentation?: string | null;
}): SymbolNode {
  return {
    id: symbolId(input.path, input.qualifiedName),
    kind: input.kind,
    name: input.name,
    qualifiedName: input.qualifiedName,
    path: input.path,
    startLine: input.startLine,
    endLine: input.endLine,
    exported: input.exported,
    parentId: input.parentId,
    decorators: input.decorators,
    signature: input.signature,
    documentation: input.documentation ?? null,
    language: input.language,
  };
}

const PARSEABLE_LANGUAGES = new Set<FileLanguage>([
  'typescript',
  'tsx',
  'javascript',
  'jsx',
]);

/**
 * Parses one file into symbols, imports, and exported names. The function is
 * deliberately syntax-only: it never asks the TypeScript compiler for types, so
 * the analyzer stays compatible with TypeScript 7's missing compiler API.
 */
export function analyzeSourceFile(
  path: string,
  text: string,
  language: FileLanguage,
  symbolLanguage: LanguageId,
): FileAnalysis {
  const buffer = Buffer.from(text, 'utf8');
  const lineStarts = lineStartsOf(buffer);
  const moduleSymbol = buildSymbol({
    path,
    language: symbolLanguage,
    kind: 'module',
    name: path.split('/').pop() ?? path,
    qualifiedName: '',
    startLine: 1,
    endLine: Math.max(1, lineStarts.length),
    exported: true,
    parentId: null,
    decorators: [],
    signature: `module ${path}`,
  });

  if (!PARSEABLE_LANGUAGES.has(language)) {
    return {
      symbols: [moduleSymbol],
      imports: [],
      exportedNames: [],
      parseErrors: [],
      entryPoint: false,
    };
  }

  const result = parseSync(path, text, { sourceType: 'module' });
  const symbols: SymbolNode[] = [moduleSymbol];
  const imports: FileImport[] = [];
  const exportedNames = new Set<string>();
  const parseErrors = result.errors.map((error) => error.message);

  for (const staticImport of result.module.staticImports) {
    const specifier = staticImport.moduleRequest.value;
    const bindings: ImportBinding[] = staticImport.entries.map((entry) => ({
      imported: entry.importName.name ?? 'default',
      local: entry.localName.value,
    }));
    imports.push({ specifier, bindings });
  }

  for (const staticExport of result.module.staticExports) {
    for (const entry of staticExport.entries) {
      const localName = entry.localName.name;
      if (typeof localName === 'string' && localName.length > 0) {
        exportedNames.add(localName);
      }
      const exportName = entry.exportName.name;
      if (typeof exportName === 'string' && exportName.length > 0) {
        exportedNames.add(exportName);
      }
    }
  }

  const containers: Array<{ node: Node; id: string; qualifiedName: string }> = [];

  walk(result.program, {
    enter(node) {
      const parent = containers[containers.length - 1] ?? null;
      const parentId = parent?.id ?? null;
      const parentPrefix = parent ? `${parent.qualifiedName}.` : '';
      const startLine = lineAt(lineStarts, node.start);
      const endLine = lineAt(lineStarts, node.end);
      const signature = signatureOf(buffer, node);

      switch (node.type) {
        case 'ClassDeclaration': {
          const name = nodeName(node.id);
          if (!name) {
            return;
          }
          const symbol = buildSymbol({
            path,
            language: symbolLanguage,
            kind: 'class',
            name,
            qualifiedName: `${parentPrefix}${name}`,
            startLine,
            endLine,
            exported: exportedNames.has(name),
            parentId,
            decorators: decoratorsOf(node),
            signature,
          });
          symbols.push(symbol);
          containers.push({
            node,
            id: symbol.id,
            qualifiedName: symbol.qualifiedName,
          });
          break;
        }
        case 'FunctionDeclaration': {
          const name = nodeName(node.id);
          if (!name) {
            return;
          }
          symbols.push(
            buildSymbol({
              path,
              language: symbolLanguage,
              kind: 'function',
              name,
              qualifiedName: `${parentPrefix}${name}`,
              startLine,
              endLine,
              exported: exportedNames.has(name),
              parentId,
              decorators: [],
              signature,
            }),
          );
          break;
        }
        case 'VariableDeclaration': {
          for (const declarator of node.declarations) {
            const name = nodeName(declarator.id);
            if (!name) {
              continue;
            }
            const initializer = declarator.init;
            const kind: SymbolKind =
              initializer?.type === 'ArrowFunctionExpression' ||
              initializer?.type === 'FunctionExpression'
                ? 'function'
                : initializer?.type === 'ObjectExpression'
                  ? 'object'
                  : 'variable';
            symbols.push(
              buildSymbol({
                path,
                language: symbolLanguage,
                kind,
                name,
                qualifiedName: `${parentPrefix}${name}`,
                startLine,
                endLine,
                exported: exportedNames.has(name),
                parentId,
                decorators: [],
                signature,
              }),
            );
          }
          break;
        }
        case 'TSInterfaceDeclaration': {
          const name = nodeName(node.id);
          if (!name) {
            return;
          }
          symbols.push(
            buildSymbol({
              path,
              language: symbolLanguage,
              kind: 'interface',
              name,
              qualifiedName: `${parentPrefix}${name}`,
              startLine,
              endLine,
              exported: exportedNames.has(name),
              parentId,
              decorators: [],
              signature,
            }),
          );
          break;
        }
        case 'TSTypeAliasDeclaration': {
          const name = nodeName(node.id);
          if (!name) {
            return;
          }
          symbols.push(
            buildSymbol({
              path,
              language: symbolLanguage,
              kind: 'type',
              name,
              qualifiedName: `${parentPrefix}${name}`,
              startLine,
              endLine,
              exported: exportedNames.has(name),
              parentId,
              decorators: [],
              signature,
            }),
          );
          break;
        }
        case 'TSEnumDeclaration': {
          const name = nodeName(node.id);
          if (!name) {
            return;
          }
          symbols.push(
            buildSymbol({
              path,
              language: symbolLanguage,
              kind: 'enum',
              name,
              qualifiedName: `${parentPrefix}${name}`,
              startLine,
              endLine,
              exported: exportedNames.has(name),
              parentId,
              decorators: [],
              signature,
            }),
          );
          break;
        }
        case 'TSModuleDeclaration': {
          const name = nodeName(node.id);
          if (!name) {
            return;
          }
          const symbol = buildSymbol({
            path,
            language: symbolLanguage,
            kind: 'namespace',
            name,
            qualifiedName: `${parentPrefix}${name}`,
            startLine,
            endLine,
            exported: exportedNames.has(name),
            parentId,
            decorators: [],
            signature,
          });
          symbols.push(symbol);
          containers.push({
            node,
            id: symbol.id,
            qualifiedName: symbol.qualifiedName,
          });
          break;
        }
        case 'MethodDefinition': {
          const name = nodeName(node.key);
          if (!name) {
            return;
          }
          symbols.push(
            buildSymbol({
              path,
              language: symbolLanguage,
              kind: 'method',
              name,
              qualifiedName: `${parentPrefix}${name}`,
              startLine,
              endLine,
              exported: false,
              parentId,
              decorators: decoratorsOf(node),
              signature,
            }),
          );
          break;
        }
        case 'PropertyDefinition': {
          const name = nodeName(node.key);
          if (!name) {
            return;
          }
          symbols.push(
            buildSymbol({
              path,
              language: symbolLanguage,
              kind: 'property',
              name,
              qualifiedName: `${parentPrefix}${name}`,
              startLine,
              endLine,
              exported: false,
              parentId,
              decorators: decoratorsOf(node),
              signature,
            }),
          );
          break;
        }
        default:
          break;
      }
    },
    leave(node) {
      const top = containers[containers.length - 1];
      if (top && top.node === node) {
        containers.pop();
      }
    },
  });

  return {
    symbols,
    imports,
    exportedNames: [...exportedNames],
    parseErrors,
    entryPoint: false,
  };
}
