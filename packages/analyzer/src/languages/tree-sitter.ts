import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Language, Parser, type Node, type Tree } from 'web-tree-sitter';
import type { LanguageId, LanguageRuntimeStat, SymbolNode } from '../types.js';

const require = createRequire(import.meta.url);

export interface GrammarRuntime {
  parser: Parser;
  language: Language;
  runtime: LanguageRuntimeStat;
}

let runtimeReady: Promise<void> | null = null;

/**
 * The web-tree-sitter runtime is initialised once per process. `Parser.init`
 * loads the runtime WASM from the installed package, so nothing is fetched from
 * the network and no project tool is executed.
 */
async function ensureRuntime(): Promise<void> {
  runtimeReady ??= Parser.init();
  return runtimeReady;
}

const grammars = new Map<LanguageId, Promise<GrammarRuntime>>();

/**
 * Loads a pinned prebuilt grammar from the `tree-sitter-wasms` package. The
 * grammar is cached for the process: `languageRuntimes` records the one-time
 * bundle size and load cost, and later analyses reuse the loaded parser.
 */
export function loadGrammar(
  id: LanguageId,
  grammarName: string,
): Promise<GrammarRuntime> {
  const existing = grammars.get(id);
  if (existing) {
    return existing;
  }

  const loading = (async (): Promise<GrammarRuntime> => {
    await ensureRuntime();
    const grammarPath = require.resolve(
      `tree-sitter-wasms/out/tree-sitter-${grammarName}.wasm`,
    );
    const startedAt = Date.now();
    const bytes = await readFile(grammarPath);
    const language = await Language.load(bytes);
    const parser = new Parser();
    parser.setLanguage(language);
    return {
      parser,
      language,
      runtime: {
        id,
        grammarBytes: bytes.byteLength,
        loadMs: Date.now() - startedAt,
        abiVersion: language.abiVersion,
      },
    };
  })();

  grammars.set(id, loading);
  return loading;
}

export interface TreeParseResult {
  tree: Tree;
  root: Node;
  parseErrors: string[];
}

/** The first ERROR or MISSING node, reported once per file to avoid noise. */
function firstSyntaxError(node: Node): Node | null {
  if (node.isError || node.isMissing) {
    return node;
  }
  for (const child of node.children) {
    if (!child) {
      continue;
    }
    const found = firstSyntaxError(child);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Parses one file with a loaded grammar. Syntax errors are reported as warnings
 * rather than failures: a half-written file still contributes the symbols it
 * has. The caller owns the tree and must delete it when done.
 */
export function parseWithGrammar(
  runtime: GrammarRuntime,
  text: string,
): TreeParseResult | null {
  const tree = runtime.parser.parse(text);
  if (!tree) {
    return null;
  }
  const parseErrors: string[] = [];
  if (tree.rootNode.hasError) {
    const error = firstSyntaxError(tree.rootNode);
    if (error) {
      parseErrors.push(
        error.isMissing
          ? `missing ${error.type} at line ${error.startPosition.row + 1}`
          : `unexpected syntax at line ${error.startPosition.row + 1}`,
      );
    }
  }
  return { tree, root: tree.rootNode, parseErrors };
}

/** 1-based line numbers, matching the snapshot's line convention. */
export function startLineOf(node: Node): number {
  return node.startPosition.row + 1;
}

export function endLineOf(node: Node): number {
  return node.endPosition.row + 1;
}

/** The first line of a declaration, collapsed and capped for the snapshot. */
export function signatureFromText(text: string): string {
  const firstLine = (text.split('\n')[0] ?? '').split('{')[0] ?? '';
  return firstLine.replace(/\s+/g, ' ').trim().slice(0, 180);
}

export function signatureOf(node: Node): string {
  return signatureFromText(node.text);
}

/**
 * The symbol model keys a member by `Type.member`, so a data member and a method
 * can claim the same id (Rust and Java both allow that). The method wins; the
 * field's line is still reachable as an anchor by line hint. Any remaining
 * duplicate id keeps its first occurrence, so an anchor never matches twice.
 */
export function dropShadowedProperties(symbols: SymbolNode[]): SymbolNode[] {
  const claimed = new Set(
    symbols
      .filter((symbol) => symbol.kind !== 'property' && symbol.kind !== 'module')
      .map((symbol) => symbol.id),
  );
  const seen = new Set<string>();
  return symbols.filter((symbol) => {
    if (symbol.kind === 'module') {
      return true;
    }
    if (symbol.kind === 'property' && claimed.has(symbol.id)) {
      return false;
    }
    if (seen.has(symbol.id)) {
      return false;
    }
    seen.add(symbol.id);
    return true;
  });
}

/** Strips quotes from a tree-sitter string literal, keeping it best-effort. */
export function stringLiteralValue(node: Node): string {
  const text = node.text;
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('`') && text.endsWith('`'))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

/** Strips comment markers from a documentation comment. */
export function stripComment(text: string): string {
  return text
    .replace(/^\/\*+/, '')
    .replace(/^\/+/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reads the comment block that sits directly above a declaration. Go, Rust, and
 * Java all document declarations with the preceding comment block, so the same
 * helper serves all three.
 */
export function leadingComment(
  node: Node,
  strip: (text: string) => string,
): string | null {
  const parts: string[] = [];
  let sibling = node.previousSibling;
  let lastLine = node.startPosition.row;
  while (sibling) {
    if (
      sibling.type !== 'comment' &&
      sibling.type !== 'line_comment' &&
      sibling.type !== 'block_comment'
    ) {
      break;
    }
    if (sibling.endPosition.row < lastLine - 1) {
      break;
    }
    parts.unshift(strip(sibling.text));
    lastLine = sibling.startPosition.row;
    sibling = sibling.previousSibling;
  }
  const comment = parts.filter(Boolean).join(' ').trim();
  return comment.length > 0 ? comment.slice(0, 240) : null;
}

/** True when a declaration has one of the given modifier keywords. */
export function hasModifier(modifiers: Node | null | undefined, name: string): boolean {
  if (!modifiers) {
    return false;
  }
  for (const child of modifiers.children) {
    if (child && child.text === name) {
      return true;
    }
  }
  return false;
}
