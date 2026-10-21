import { parseSync, type Node } from 'oxc-parser';
import { walk } from 'oxc-walker';
import type {
  CallSite,
  ClassMemberType,
  FileAnalysis,
  FileImport,
  FileLanguage,
  ImportBinding,
  LanguageId,
  SymbolDecorator,
  SymbolKind,
  SymbolNode,
} from './types.js';

function lineStartsOf(text: string): number[] {
  const starts = [0];
  // oxc-parser spans are JavaScript string offsets, not UTF-8 byte offsets.
  // Measuring against a Buffer drifts after any non-ASCII character, which
  // silently shifts symbol and call lines in files with typographic prose.
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
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

function signatureOf(text: string, node: Node): string {
  const end = Math.min(node.end, node.start + 240);
  const raw = text.slice(node.start, end);
  const firstLine = raw.split('\n')[0] ?? '';
  return firstLine.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function symbolId(path: string, qualifiedName: string): string {
  return qualifiedName.length === 0
    ? `symbol:${path}`
    : `symbol:${path}#${qualifiedName}`;
}

/**
 * The receiver text of a call. Resolution needs the stable name (`this.store`)
 * rather than source whitespace, so anonymous or computed expressions return
 * null and are counted as unresolved after all files are parsed.
 */
function expressionText(node: Node | null | undefined): string | null {
  if (!node) {
    return null;
  }
  switch (node.type) {
    case 'Identifier':
      return node.name;
    case 'ThisExpression':
      return 'this';
    case 'MemberExpression':
      if (node.computed) {
        return null;
      }
      {
        const object = expressionText(node.object);
        return object === null ? null : `${object}.${node.property.name}`;
      }
    case 'CallExpression':
      return expressionText(node.callee);
    case 'ChainExpression':
      return expressionText(node.expression);
    case 'ParenthesizedExpression':
      return expressionText(node.expression);
    case 'TSNonNullExpression':
      return expressionText(node.expression);
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSTypeAssertion':
      return expressionText(node.expression);
    default:
      return null;
  }
}

/** Splits `this.store.save` into receiver `this.store` and member `save`. */
function calleeOf(callee: Node): { callee: string; member?: string } | null {
  if (callee.type === 'Identifier') {
    return { callee: callee.name };
  }
  if (callee.type !== 'MemberExpression' || callee.computed) {
    return null;
  }
  const object = expressionText(callee.object);
  if (object === null) {
    return null;
  }
  return { callee: object, member: callee.property.name };
}

/** The written name of a simple type annotation (`Store`, not `Map<string, Store>`). */
function declaredTypeName(annotation: Node | null | undefined): string | null {
  if (!annotation || annotation.type !== 'TSTypeAnnotation') {
    return null;
  }
  const type = annotation.typeAnnotation;
  if (type.type !== 'TSTypeReference') {
    return null;
  }
  if (type.typeName.type === 'Identifier') {
    return type.typeName.name;
  }
  if (type.typeName.type === 'TSQualifiedName') {
    return type.typeName.right.name;
  }
  return null;
}

/** Constructor parameter properties may be destructured or carry a default. */
function bindingNameAndType(
  node: Node,
): { name: string; annotation: Node | null | undefined } | null {
  if (node.type === 'Identifier') {
    return { name: node.name, annotation: node.typeAnnotation };
  }
  if (node.type === 'AssignmentPattern') {
    return bindingNameAndType(node.left);
  }
  return null;
}

/** One lexical container: the innermost symbol a call is attributed to. */
interface Container {
  node: Node;
  id: string;
  kind: SymbolKind;
  qualifiedName: string;
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
  const lineStarts = lineStartsOf(text);
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
    imports.push({
      specifier,
      bindings,
      line: lineAt(lineStarts, staticImport.start),
    });
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

  const callSites: CallSite[] = [];
  const memberTypes: ClassMemberType[] = [];
  const containers: Container[] = [];
  // A function-valued variable's container belongs to the function node, not
  // the declaration: the body must resolve through `helper`, while the
  // declarator's own children must not start a second container.
  const pendingFunctionContainers = new Map<number, Container>();
  const enclosingClass = (): Container | null => {
    for (let index = containers.length - 1; index >= 0; index -= 1) {
      const container = containers[index];
      if (container?.kind === 'class') {
        return container;
      }
    }
    return null;
  };
  const addMemberType = (member: string, annotation: Node | null | undefined): void => {
    const className = enclosingClass()?.qualifiedName;
    const typeName = declaredTypeName(annotation);
    if (!className || !typeName) {
      return;
    }
    memberTypes.push({ className, member, typeName });
  };
  const addFunctionContainer = (node: Node, symbol: SymbolNode): void => {
    pendingFunctionContainers.set(node.start, {
      node,
      id: symbol.id,
      kind: symbol.kind,
      qualifiedName: symbol.qualifiedName,
    });
  };

  walk(result.program, {
    enter(node) {
      const pending = pendingFunctionContainers.get(node.start);
      if (pending) {
        pendingFunctionContainers.delete(node.start);
        containers.push(pending);
      }
      const parent = containers[containers.length - 1] ?? null;
      const parentId = parent?.id ?? null;
      const parentPrefix = parent ? `${parent.qualifiedName}.` : '';
      const startLine = lineAt(lineStarts, node.start);
      const endLine = lineAt(lineStarts, node.end);
      const signature = signatureOf(text, node);

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
            kind: 'class',
            qualifiedName: symbol.qualifiedName,
          });
          break;
        }
        case 'FunctionDeclaration': {
          const name = nodeName(node.id);
          if (!name) {
            return;
          }
          const symbol = buildSymbol({
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
          });
          symbols.push(symbol);
          containers.push({
            node,
            id: symbol.id,
            kind: 'function',
            qualifiedName: symbol.qualifiedName,
          });
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
            const symbol = buildSymbol({
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
            });
            symbols.push(symbol);
            if (
              initializer?.type === 'ArrowFunctionExpression' ||
              initializer?.type === 'FunctionExpression'
            ) {
              addFunctionContainer(initializer, symbol);
            }
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
            kind: 'namespace',
            qualifiedName: symbol.qualifiedName,
          });
          break;
        }
        case 'MethodDefinition': {
          const name = nodeName(node.key);
          if (!name) {
            return;
          }
          for (const parameter of node.value.params) {
            if (parameter.type !== 'TSParameterProperty') {
              continue;
            }
            const binding = bindingNameAndType(parameter.parameter);
            if (binding) {
              addMemberType(binding.name, binding.annotation);
            }
          }
          addMemberType(name, node.value.returnType);
          const symbol = buildSymbol({
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
          });
          symbols.push(symbol);
          containers.push({
            node,
            id: symbol.id,
            kind: 'method',
            qualifiedName: symbol.qualifiedName,
          });
          break;
        }
        case 'PropertyDefinition': {
          const name = nodeName(node.key);
          if (!name) {
            return;
          }
          addMemberType(name, node.typeAnnotation);
          const symbol = buildSymbol({
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
          });
          symbols.push(symbol);
          if (
            node.value?.type === 'ArrowFunctionExpression' ||
            node.value?.type === 'FunctionExpression'
          ) {
            addFunctionContainer(node.value, symbol);
          }
          break;
        }
        case 'CallExpression': {
          const callee = calleeOf(node.callee);
          if (!callee) {
            return;
          }
          callSites.push({
            fromQualifiedName: containers[containers.length - 1]?.qualifiedName ?? '',
            callee: callee.callee,
            ...(callee.member === undefined ? {} : { member: callee.member }),
            line: startLine,
          });
          break;
        }
        default:
          break;
      }
    },
    leave(node) {
      while (containers[containers.length - 1]?.node === node) {
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
    callSites,
    memberTypes,
  };
}
