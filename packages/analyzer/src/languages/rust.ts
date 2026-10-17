import path from 'node:path';
import type { Node } from 'web-tree-sitter';
import { readCargoManifest } from '../manifests.js';
import type { LanguageAnalyzer } from '../port.js';
import { buildSymbol } from '../symbols.js';
import type { FileAnalysis, FileImport, SymbolDecorator, SymbolNode } from '../types.js';
import {
  dropShadowedProperties,
  endLineOf,
  leadingComment,
  loadGrammar,
  parseWithGrammar,
  signatureOf,
  startLineOf,
  stripComment,
  type GrammarRuntime,
} from './tree-sitter.js';

let grammar: GrammarRuntime | null = null;

interface RustContext {
  path: string;
  symbols: SymbolNode[];
  imports: FileImport[];
  /** Type names declared in this file, so impl methods can parent to them. */
  typeIds: Map<string, string>;
  entryPoint: boolean;
}

interface RustContainer {
  id: string | null;
  qualifiedName: string;
  kind: 'module' | 'impl' | 'trait';
}

function qualifiedNameOf(container: RustContainer | null, name: string): string {
  return container ? `${container.qualifiedName}.${name}` : name;
}

function hasVisibility(node: Node): boolean {
  return node.namedChildren.some((child) => child?.type === 'visibility_modifier');
}

function attributesOf(node: Node): SymbolDecorator[] {
  const decorators: SymbolDecorator[] = [];
  for (const attribute of node.namedChildren) {
    if (attribute?.type !== 'attribute') {
      continue;
    }
    const name = attribute.namedChildren[0];
    if (!name) {
      continue;
    }
    const argumentsNode = attribute.namedChildren[1];
    decorators.push({
      name: name.text,
      argument: argumentsNode
        ? argumentsNode.text.replace(/^\(|\)$/g, '').slice(0, 120)
        : null,
    });
  }
  return decorators;
}

/** `impl Display for Greeter` and `impl<T> Store<T>` both resolve to `Greeter`/`Store`. */
function implTypeName(node: Node | null | undefined): string | null {
  if (!node) {
    return null;
  }
  if (node.type === 'generic_type') {
    return implTypeName(node.namedChildren[0]);
  }
  if (node.type === 'scoped_type_identifier') {
    return node.namedChildren[node.namedChildren.length - 1]?.text ?? null;
  }
  return node.text;
}

/** Expands a `use` declaration into one import per imported leaf. */
function expandUse(argument: Node): FileImport[] {
  if (argument.type === 'scoped_use_list') {
    const base = argument.namedChildren[0]?.text ?? '';
    const list = argument.namedChildren[1];
    const imports: FileImport[] = [];
    for (const item of list?.namedChildren ?? []) {
      if (!item) {
        continue;
      }
      if (item.type === 'self') {
        imports.push({ specifier: base, bindings: [] });
        continue;
      }
      const specifier = `${base}::${item.text}`;
      const imported = item.text.split('::').pop() ?? item.text;
      imports.push({
        specifier,
        bindings: [{ imported, local: imported }],
      });
    }
    return imports;
  }

  if (argument.type === 'use_wildcard') {
    const base = argument.text.replace(/::\*$/, '');
    return [{ specifier: base, bindings: [] }];
  }

  if (argument.type === 'use_as_clause') {
    const [target, alias] = argument.text.split(/\s+as\s+/);
    const specifier = (target ?? argument.text).trim();
    const imported = specifier.split('::').pop() ?? specifier;
    return [
      {
        specifier,
        bindings: [{ imported, local: alias?.trim() ?? imported }],
      },
    ];
  }

  const specifier = argument.text;
  const imported = specifier.split('::').pop() ?? specifier;
  return [{ specifier, bindings: [{ imported, local: imported }] }];
}

function handleItem(
  ctx: RustContext,
  node: Node,
  decorators: SymbolDecorator[],
  container: RustContainer | null,
): void {
  switch (node.type) {
    case 'use_declaration': {
      const argument = node.childForFieldName('argument');
      if (argument) {
        ctx.imports.push(...expandUse(argument));
      }
      return;
    }
    case 'mod_item': {
      const name = node.childForFieldName('name')?.text;
      if (!name) {
        return;
      }
      const body = node.childForFieldName('body');
      if (!body) {
        // `mod foo;` names a file, so it is a real file import. An inline
        // module has no file of its own.
        ctx.imports.push({ specifier: name, bindings: [] });
        return;
      }
      const symbol = buildSymbol({
        path: ctx.path,
        language: 'rust',
        kind: 'namespace',
        name,
        qualifiedName: qualifiedNameOf(container, name),
        startLine: startLineOf(node),
        endLine: endLineOf(node),
        exported: hasVisibility(node),
        parentId: container?.id ?? null,
        decorators,
        signature: signatureOf(node),
        documentation: leadingComment(node, stripComment),
      });
      ctx.symbols.push(symbol);
      walkItems(ctx, body, {
        id: symbol.id,
        qualifiedName: symbol.qualifiedName,
        kind: 'module',
      });
      return;
    }
    case 'struct_item': {
      const name = node.childForFieldName('name')?.text;
      if (!name) {
        return;
      }
      const symbol = buildSymbol({
        path: ctx.path,
        language: 'rust',
        kind: 'class',
        name,
        qualifiedName: qualifiedNameOf(container, name),
        startLine: startLineOf(node),
        endLine: endLineOf(node),
        exported: hasVisibility(node),
        parentId: container?.id ?? null,
        decorators,
        signature: signatureOf(node),
        documentation: leadingComment(node, stripComment),
      });
      ctx.symbols.push(symbol);
      ctx.typeIds.set(symbol.qualifiedName, symbol.id);
      for (const field of node.descendantsOfType('field_declaration')) {
        if (!field) {
          continue;
        }
        const fieldName = field.childForFieldName('name')?.text;
        if (!fieldName) {
          continue;
        }
        ctx.symbols.push(
          buildSymbol({
            path: ctx.path,
            language: 'rust',
            kind: 'property',
            name: fieldName,
            qualifiedName: `${symbol.qualifiedName}.${fieldName}`,
            startLine: startLineOf(field),
            endLine: endLineOf(field),
            exported: false,
            parentId: symbol.id,
            decorators: [],
            signature: signatureOf(field),
          }),
        );
      }
      return;
    }
    case 'enum_item': {
      const name = node.childForFieldName('name')?.text;
      if (!name) {
        return;
      }
      ctx.symbols.push(
        buildSymbol({
          path: ctx.path,
          language: 'rust',
          kind: 'enum',
          name,
          qualifiedName: qualifiedNameOf(container, name),
          startLine: startLineOf(node),
          endLine: endLineOf(node),
          exported: hasVisibility(node),
          parentId: container?.id ?? null,
          decorators,
          signature: signatureOf(node),
          documentation: leadingComment(node, stripComment),
        }),
      );
      return;
    }
    case 'trait_item': {
      const name = node.childForFieldName('name')?.text;
      if (!name) {
        return;
      }
      const symbol = buildSymbol({
        path: ctx.path,
        language: 'rust',
        kind: 'interface',
        name,
        qualifiedName: qualifiedNameOf(container, name),
        startLine: startLineOf(node),
        endLine: endLineOf(node),
        exported: hasVisibility(node),
        parentId: container?.id ?? null,
        decorators,
        signature: signatureOf(node),
        documentation: leadingComment(node, stripComment),
      });
      ctx.symbols.push(symbol);
      const body = node.childForFieldName('body');
      if (body) {
        walkItems(ctx, body, {
          id: symbol.id,
          qualifiedName: symbol.qualifiedName,
          kind: 'trait',
        });
      }
      return;
    }
    case 'impl_item': {
      const typeName = implTypeName(node.childForFieldName('type'));
      if (!typeName) {
        return;
      }
      const body = node.childForFieldName('body');
      if (!body) {
        return;
      }
      const parentQualifiedName =
        container?.kind === 'module' && container.qualifiedName.length > 0
          ? `${container.qualifiedName}.${typeName}`
          : typeName;
      walkItems(ctx, body, {
        id: ctx.typeIds.get(parentQualifiedName) ?? null,
        qualifiedName: parentQualifiedName,
        kind: 'impl',
      });
      return;
    }
    case 'function_item':
    case 'function_signature_item': {
      const name = node.childForFieldName('name')?.text;
      if (!name) {
        return;
      }
      const isMember = container?.kind === 'impl' || container?.kind === 'trait';
      if (!isMember && name === 'main') {
        ctx.entryPoint = true;
      }
      ctx.symbols.push(
        buildSymbol({
          path: ctx.path,
          language: 'rust',
          kind: isMember ? 'method' : 'function',
          name,
          qualifiedName: qualifiedNameOf(container, name),
          startLine: startLineOf(node),
          endLine: endLineOf(node),
          // Trait items are part of the trait's public API even without `pub`.
          exported: hasVisibility(node) || container?.kind === 'trait',
          parentId: container?.id ?? null,
          decorators,
          signature: signatureOf(node),
          documentation: leadingComment(node, stripComment),
        }),
      );
      return;
    }
    case 'const_item':
    case 'static_item': {
      const name = node.childForFieldName('name')?.text;
      if (!name) {
        return;
      }
      ctx.symbols.push(
        buildSymbol({
          path: ctx.path,
          language: 'rust',
          kind: 'variable',
          name,
          qualifiedName: qualifiedNameOf(container, name),
          startLine: startLineOf(node),
          endLine: endLineOf(node),
          exported: hasVisibility(node),
          parentId: container?.id ?? null,
          decorators,
          signature: signatureOf(node),
          documentation: leadingComment(node, stripComment),
        }),
      );
      return;
    }
    case 'type_item': {
      const name = node.childForFieldName('name')?.text;
      if (!name) {
        return;
      }
      ctx.symbols.push(
        buildSymbol({
          path: ctx.path,
          language: 'rust',
          kind: 'type',
          name,
          qualifiedName: qualifiedNameOf(container, name),
          startLine: startLineOf(node),
          endLine: endLineOf(node),
          exported: hasVisibility(node),
          parentId: container?.id ?? null,
          decorators,
          signature: signatureOf(node),
          documentation: leadingComment(node, stripComment),
        }),
      );
      return;
    }
    case 'macro_definition': {
      const name = node.childForFieldName('name')?.text;
      if (!name) {
        return;
      }
      // A macro is not a function and not a type; `other` is the honest kind.
      ctx.symbols.push(
        buildSymbol({
          path: ctx.path,
          language: 'rust',
          kind: 'other',
          name,
          qualifiedName: qualifiedNameOf(container, name),
          startLine: startLineOf(node),
          endLine: endLineOf(node),
          exported: true,
          parentId: container?.id ?? null,
          decorators,
          signature: signatureOf(node),
          documentation: leadingComment(node, stripComment),
        }),
      );
      return;
    }
    default:
      return;
  }
}

function walkItems(ctx: RustContext, body: Node, container: RustContainer | null): void {
  let pendingAttributes: SymbolDecorator[] = [];
  for (const child of body.namedChildren) {
    if (!child) {
      continue;
    }
    if (child.type === 'line_comment' || child.type === 'block_comment') {
      continue;
    }
    if (child.type === 'attribute_item') {
      pendingAttributes.push(...attributesOf(child));
      continue;
    }
    const decorators = pendingAttributes;
    pendingAttributes = [];
    handleItem(ctx, child, decorators, container);
  }
}

function parseRust(filePath: string, text: string): FileAnalysis {
  if (!grammar) {
    throw new Error('the rust grammar is not loaded');
  }
  const lineCount = Math.max(1, text.split('\n').length);
  const ctx: RustContext = {
    path: filePath,
    symbols: [
      buildSymbol({
        path: filePath,
        language: 'rust',
        kind: 'module',
        name: filePath.split('/').pop() ?? filePath,
        qualifiedName: '',
        startLine: 1,
        endLine: lineCount,
        exported: true,
        parentId: null,
        decorators: [],
        signature: `module ${filePath}`,
      }),
    ],
    imports: [],
    typeIds: new Map(),
    entryPoint: false,
  };

  const parsed = parseWithGrammar(grammar, text);
  if (!parsed) {
    return {
      symbols: ctx.symbols,
      imports: ctx.imports,
      exportedNames: [],
      parseErrors: ['the rust parser returned no tree'],
      entryPoint: false,
    };
  }

  try {
    walkItems(ctx, parsed.root, null);
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

/** The directory Rust looks in for submodules of this file. */
function rustModuleDirectory(fromPath: string): string {
  const directory = path.posix.dirname(fromPath);
  const base = path.posix.basename(fromPath, '.rs');
  if (base === 'main' || base === 'lib' || base === 'mod') {
    return directory;
  }
  return path.posix.join(directory, base);
}

/** The nearest ancestor directory that holds a crate root file. */
function rustCrateRoot(fromPath: string, fileSet: ReadonlySet<string>): string {
  let directory = path.posix.dirname(fromPath);
  for (let level = 0; level < 8; level += 1) {
    if (
      fileSet.has(path.posix.join(directory, 'main.rs')) ||
      fileSet.has(path.posix.join(directory, 'lib.rs'))
    ) {
      return directory;
    }
    const parent = path.posix.dirname(directory);
    if (parent === directory || directory === '.') {
      break;
    }
    directory = parent;
  }
  return 'src';
}

/**
 * Resolves Rust imports: `mod name;` to the submodule file, `crate::`, `self::`,
 * and `super::` paths to the longest matching module prefix. External crates
 * stay external nodes, which is never an error.
 */
export function resolveRustImport(
  fromPath: string,
  specifier: string,
  fileSet: ReadonlySet<string>,
): string | null {
  if (!specifier.includes('::')) {
    const base = rustModuleDirectory(fromPath);
    return (
      [`${base}/${specifier}.rs`, `${base}/${specifier}/mod.rs`].find((candidate) =>
        fileSet.has(candidate),
      ) ?? null
    );
  }

  const segments = specifier.split('::');
  let root: string;
  let rest: string[];
  let superCount = 0;
  while (segments[superCount] === 'super') {
    superCount += 1;
  }

  if (segments[0] === 'crate') {
    root = rustCrateRoot(fromPath, fileSet);
    rest = segments.slice(1);
  } else if (segments[0] === 'self') {
    root = rustModuleDirectory(fromPath);
    rest = segments.slice(1);
  } else if (superCount > 0) {
    root = rustModuleDirectory(fromPath);
    for (let level = 0; level < superCount; level += 1) {
      root = path.posix.dirname(root);
    }
    rest = segments.slice(superCount);
  } else {
    // Rust 2018 lets a `use` path start at a crate-level module, so try the
    // crate root before declaring the specifier external.
    root = rustCrateRoot(fromPath, fileSet);
    rest = segments;
  }

  for (let end = rest.length; end > 0; end -= 1) {
    const modulePath = rest.slice(0, end).join('/');
    const candidates = [`${root}/${modulePath}.rs`, `${root}/${modulePath}/mod.rs`];
    const resolved = candidates.find((candidate) => fileSet.has(candidate));
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

export const rustAnalyzer: LanguageAnalyzer = {
  id: 'rust',
  displayName: 'Rust',
  claims: [{ fileLanguage: 'rust', language: 'rust' }],
  requiresGrammar: true,
  risks: [
    'Macro-generated items are not expanded; only source-level items are symbols.',
    'External crate imports become external nodes; the analyzer does not read the cargo registry.',
  ],
  async prepare() {
    grammar = await loadGrammar('rust', 'rust');
    return grammar.runtime;
  },
  parse({ path: filePath, text }) {
    return parseRust(filePath, text);
  },
  resolveImport: resolveRustImport,
  isExternal: (specifier) =>
    specifier.includes('::') &&
    !specifier.startsWith('crate::') &&
    !specifier.startsWith('self::') &&
    !specifier.startsWith('super::'),
  packageName: (specifier) => specifier.split('::')[0] ?? specifier,
  entryPoints({ files, analyses }) {
    const entryPoints = new Set<string>();
    for (const file of files) {
      if (
        /(^|\/)src\/main\.rs$/.test(file.path) ||
        /(^|\/)src\/bin\/[^/]+\.rs$/.test(file.path) ||
        analyses.get(file.path)?.entryPoint === true
      ) {
        entryPoints.add(file.path);
      }
    }
    return [...entryPoints].toSorted();
  },
  manifestNames: ['Cargo.toml'],
  readManifest: readCargoManifest,
};
