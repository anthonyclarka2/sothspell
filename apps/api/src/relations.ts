import { realpath } from 'node:fs/promises';
import {
  ANALYZER_VERSION,
  analyzeProject,
  loadSnapshot,
  redactionReason,
  selectSymbolRelations,
  snapshotPathFor,
  type ProjectSnapshot,
  type SymbolNode,
} from '@sothspell/analyzer';
import type {
  CanvasCodeContainer,
  CanvasIdentifierTarget,
  CanvasRelationDirection,
  CanvasRelationItem,
  CanvasRelationResponse,
  CanvasSymbolRef,
} from '@sothspell/canvas';
import {
  hashText,
  highlightCodeLines,
  languageForPath,
  readSourceFile,
  type SourceFile,
} from '@sothspell/core';

/**
 * The bounded relation service behind the canvas API. It loads a saved
 * snapshot when it matches the current analyzer, otherwise analyzes the
 * resolved root once and caches the result. The browser receives only symbol
 * references, short excerpts, and identifier targets, never a snapshot.
 */

export const MAX_RELATION_LIMIT = 8;
export const MAX_TOTAL_EXCERPT_BYTES = 64 * 1024;
export const MAX_CONTAINER_BYTES = 16 * 1024;
export const MAX_EXCERPT_LINES = 120;
export const MAX_IDENTIFIER_TARGETS = 50;

const IDENTIFIER_PATTERN = /[A-Za-z_$][A-Za-z0-9_$]*/gu;

export class RelationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RelationInputError';
  }
}

export class RelationSymbolNotFoundError extends Error {
  constructor(message = 'unknown symbol') {
    super(message);
    this.name = 'RelationSymbolNotFoundError';
  }
}

export class RelationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RelationUnavailableError';
  }
}

export class RelationSourceRedactedError extends Error {
  constructor(message = 'the source for this symbol is redacted') {
    super(message);
    this.name = 'RelationSourceRedactedError';
  }
}

export interface RelationQuery {
  slug: string;
  /** Resolved local source root, or null when the project record is missing. */
  root: string | null;
  direction: CanvasRelationDirection;
  symbolId?: string | undefined;
  path?: string | undefined;
  symbol?: string | undefined;
  limit: number;
  offset: number;
}

export interface RelationService {
  load(query: RelationQuery): Promise<CanvasRelationResponse>;
}

export interface CreateRelationServiceOptions {
  /** SOTHSPELL_HOME. */
  home: string;
  /** Per-file analysis cache used only when a fresh analysis is required. */
  analysisCacheDirectory?: string;
  /** Injection point for tests that need to count analyses. */
  analyze?: typeof analyzeProject;
}

interface ExcerptBudget {
  remaining: number;
  truncated: boolean;
}

function refFor(symbol: SymbolNode): CanvasSymbolRef {
  return {
    id: symbol.id,
    name: symbol.name,
    qualifiedName: symbol.qualifiedName,
    kind: symbol.kind,
    path: symbol.path,
    startLine: symbol.startLine,
    endLine: symbol.endLine,
    language: String(symbol.language),
  };
}

function clampLine(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

interface LineWindow {
  start: number;
  end: number;
  /** The symbol or focus range was longer than the line cap. */
  clipped: boolean;
}

/**
 * Picks a short window inside one symbol. A relation excerpt centres on the
 * call site or import line; a definition starts at its symbol.
 */
function lineWindow(
  startLine: number,
  endLine: number,
  focusLine: number | null,
  maxLines: number,
): LineWindow {
  const start = Math.max(1, startLine);
  const end = Math.max(start, endLine);
  const available = end - start + 1;
  if (available <= maxLines) {
    return { start, end, clipped: false };
  }

  if (focusLine === null) {
    return { start, end: start + maxLines - 1, clipped: true };
  }

  const focus = clampLine(focusLine, start, end);
  const before = Math.floor((maxLines - 1) / 2);
  let windowStart = Math.max(start, focus - before);
  let windowEnd = Math.min(end, windowStart + maxLines - 1);
  windowStart = Math.max(start, windowEnd - maxLines + 1);
  windowEnd = Math.max(windowStart, Math.min(end, windowStart + maxLines - 1));
  return { start: windowStart, end: windowEnd, clipped: true };
}

interface FittedText {
  start: number;
  end: number;
  text: string;
  bytes: number;
  clipped: boolean;
}

/**
 * Shrinks a line window until it fits the remaining byte budget. A focus line
 * is preserved as long as one line can fit, because a relation excerpt is only
 * useful when it contains the call or import it claims to show.
 */
function fitText(
  lines: readonly string[],
  window: LineWindow,
  focusLine: number | null,
  budgetBytes: number,
): FittedText | null {
  let start = window.start;
  let end = window.end;
  let clipped = window.clipped;

  for (;;) {
    const text = lines.slice(start - 1, end).join('\n');
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes <= budgetBytes) {
      return { start, end, text, bytes, clipped };
    }
    if (start === end) {
      return null;
    }

    if (focusLine === null) {
      end -= 1;
    } else if (start < focusLine) {
      start += 1;
    } else if (end > focusLine) {
      end -= 1;
    } else {
      start += 1;
    }
    clipped = true;
  }
}

function containerFor(
  symbol: SymbolNode,
  startLine: number,
  endLine: number,
  excerpt: string,
  html: string,
): CanvasCodeContainer {
  const label =
    symbol.qualifiedName.length > 0
      ? symbol.qualifiedName
      : symbol.name.length > 0
        ? symbol.name
        : symbol.path;
  return {
    id: `code:${symbol.id}`,
    anchorId: symbol.id,
    symbolId: symbol.id,
    label,
    path: symbol.path,
    startLine,
    endLine,
    language: languageForPath(symbol.path),
    excerpt,
    html,
    collapsed: false,
  };
}

function collectIdentifierTargets(
  snapshot: ProjectSnapshot,
  containers: readonly CanvasCodeContainer[],
): CanvasIdentifierTarget[] {
  const byPathAndName = new Map<string, SymbolNode[]>();
  const byId = new Map<string, SymbolNode>();
  for (const symbol of snapshot.symbols) {
    byId.set(symbol.id, symbol);
    if (symbol.kind === 'module') {
      continue;
    }
    const key = `${symbol.path}\u0000${symbol.name}`;
    const entries = byPathAndName.get(key) ?? [];
    entries.push(symbol);
    byPathAndName.set(key, entries);
  }

  const idsByText = new Map<string, Set<string>>();
  for (const container of containers) {
    const names = new Set(container.excerpt.match(IDENTIFIER_PATTERN) ?? []);
    for (const name of names) {
      const candidates = byPathAndName.get(`${container.path}\u0000${name}`) ?? [];
      // A duplicated name in one file is ambiguous; the client must leave it
      // as plain text rather than inventing a link to one overload.
      if (candidates.length !== 1) {
        continue;
      }
      const id = candidates[0]?.id;
      if (!id) {
        continue;
      }
      const ids = idsByText.get(name) ?? new Set<string>();
      ids.add(id);
      idsByText.set(name, ids);
    }
  }

  const targets: CanvasIdentifierTarget[] = [];
  for (const [text, ids] of [...idsByText.entries()].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (ids.size !== 1) {
      continue;
    }
    const symbolId = [...ids][0];
    const symbol = symbolId === undefined ? null : byId.get(symbolId);
    if (!symbol) {
      continue;
    }
    targets.push({ text, symbolId: symbol.id, path: symbol.path });
    if (targets.length >= MAX_IDENTIFIER_TARGETS) {
      break;
    }
  }
  return targets;
}

function isSafePathError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /absolute paths|path traversal|path escapes|path points outside|NUL byte/iu.test(
    error.message,
  );
}

function findSymbol(
  snapshot: ProjectSnapshot,
  path: string,
  qualifiedName: string,
): SymbolNode | null {
  const matches = snapshot.symbols.filter(
    (symbol) =>
      symbol.path === path &&
      (symbol.qualifiedName === qualifiedName || symbol.name === qualifiedName),
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function resolveSymbol(
  snapshot: ProjectSnapshot,
  query: RelationQuery,
): SymbolNode | null {
  if (query.symbolId !== undefined) {
    if (query.symbolId.startsWith('legacy:')) {
      const rest = query.symbolId.slice('legacy:'.length);
      const separator = rest.lastIndexOf('#');
      if (separator < 1) {
        return null;
      }
      return findSymbol(snapshot, rest.slice(0, separator), rest.slice(separator + 1));
    }
    return snapshot.symbols.find((symbol) => symbol.id === query.symbolId) ?? null;
  }
  if (query.path === undefined || query.symbol === undefined) {
    return null;
  }
  return findSymbol(snapshot, query.path, query.symbol);
}

export function createRelationService(
  options: CreateRelationServiceOptions,
): RelationService {
  const analyze = options.analyze ?? analyzeProject;
  const analyses = new Map<string, Promise<ProjectSnapshot>>();

  const analyzeOnce = (root: string): Promise<ProjectSnapshot> => {
    const fingerprint = hashText(root).slice('sha256:'.length, 'sha256:'.length + 16);
    const key = `${root}\u0000${fingerprint}\u0000${ANALYZER_VERSION}`;
    const cached = analyses.get(key);
    if (cached) {
      return cached;
    }
    const promise =
      options.analysisCacheDirectory === undefined
        ? analyze(root)
        : analyze(root, { cacheDirectory: options.analysisCacheDirectory });
    promise.catch(() => {
      // A failed analysis must not poison every later request.
      analyses.delete(key);
    });
    analyses.set(key, promise);
    return promise;
  };

  const snapshotFor = async (query: RelationQuery): Promise<ProjectSnapshot> => {
    let saved: ProjectSnapshot | null = null;
    try {
      saved = await loadSnapshot(snapshotPathFor(options.home, query.slug));
    } catch {
      saved = null;
    }
    if (
      saved &&
      saved.analyzerVersion === ANALYZER_VERSION &&
      saved.project.slug === query.slug
    ) {
      return saved;
    }

    if (!query.root) {
      throw new RelationUnavailableError(
        'relations are unavailable: no project record or source root is configured',
      );
    }

    let canonical: string;
    try {
      canonical = await realpath(query.root);
    } catch {
      throw new RelationUnavailableError(
        'relations are unavailable: the project source root cannot be read',
      );
    }

    try {
      return await analyzeOnce(canonical);
    } catch {
      throw new RelationUnavailableError(
        'relations are unavailable: the project source could not be analyzed',
      );
    }
  };

  return {
    async load(query) {
      if (
        query.symbolId === undefined &&
        (query.path === undefined || query.symbol === undefined)
      ) {
        throw new RelationInputError('symbolId, or both path and symbol, are required');
      }
      if (query.path === undefined && query.symbol !== undefined) {
        throw new RelationInputError('path is required when symbol is given');
      }
      if (query.path !== undefined && query.symbol === undefined) {
        throw new RelationInputError('symbol is required when path is given');
      }

      const snapshot = await snapshotFor(query);
      const symbol = resolveSymbol(snapshot, query);
      if (!symbol) {
        throw new RelationSymbolNotFoundError();
      }

      const sources = new Map<string, Promise<SourceFile>>();
      const readSource = async (sourcePath: string): Promise<SourceFile> => {
        const cached = sources.get(sourcePath);
        if (cached) {
          return cached;
        }
        const promise = (async () => {
          try {
            return await readSourceFile(query.root ?? '', sourcePath);
          } catch (error) {
            if (isSafePathError(error)) {
              throw new RelationInputError('the symbol path is not a safe project path');
            }
            throw new RelationUnavailableError(
              'relations are unavailable: the source for this symbol cannot be read',
            );
          }
        })();
        sources.set(sourcePath, promise);
        return promise;
      };

      const budget: ExcerptBudget = {
        remaining: MAX_TOTAL_EXCERPT_BYTES,
        truncated: false,
      };

      const buildContainer = async (
        target: SymbolNode,
        focusLine: number | null,
      ): Promise<CanvasCodeContainer | null> => {
        const fileEntry = snapshot.files.find((file) => file.path === target.path);
        if (fileEntry?.redacted) {
          throw new RelationSourceRedactedError();
        }
        if (!query.root) {
          throw new RelationUnavailableError(
            'relations are unavailable: no source root is configured',
          );
        }

        const source = await readSource(target.path);
        if (redactionReason(source.text) !== null) {
          throw new RelationSourceRedactedError();
        }

        const lines = source.text.split('\n');
        if (lines.length === 0) {
          return null;
        }
        const start = clampLine(target.startLine, 1, lines.length);
        const end = clampLine(target.endLine, start, lines.length);
        const window = lineWindow(start, end, focusLine, MAX_EXCERPT_LINES);
        const fitted = fitText(
          lines,
          window,
          focusLine,
          Math.min(MAX_CONTAINER_BYTES, budget.remaining),
        );
        if (!fitted) {
          return null;
        }

        budget.remaining -= fitted.bytes;
        if (fitted.clipped) {
          budget.truncated = true;
        }

        const focusOffset =
          focusLine === null
            ? { startLine: 1, endLine: Math.max(1, fitted.end - fitted.start + 1) }
            : {
                startLine:
                  clampLine(focusLine, fitted.start, fitted.end) - fitted.start + 1,
                endLine:
                  clampLine(focusLine, fitted.start, fitted.end) - fitted.start + 1,
              };
        const highlighted = await highlightCodeLines(
          fitted.text,
          languageForPath(target.path),
          focusOffset,
        );

        return containerFor(
          target,
          fitted.start,
          fitted.end,
          fitted.text,
          highlighted.html,
        );
      };

      const definition = await buildContainer(symbol, null);
      if (!definition) {
        throw new RelationUnavailableError(
          'relations are unavailable: the symbol excerpt is too large to return',
        );
      }

      const limit = Math.min(MAX_RELATION_LIMIT, Math.max(1, Math.trunc(query.limit)));
      const offset = Math.max(0, Math.trunc(query.offset));
      const relations: CanvasRelationItem[] = [];
      let truncated = budget.truncated;

      if (query.direction !== 'definition') {
        const selection = selectSymbolRelations(
          snapshot,
          symbol.id,
          query.direction,
          limit,
          offset,
        );
        truncated ||= selection.truncated;
        for (const relation of selection.relations) {
          const container = await buildContainer(relation.symbol, relation.line);
          if (!container) {
            // The byte cap stopped this container. Later relations are smaller
            // only by accident; stopping keeps the order deterministic.
            truncated = true;
            break;
          }
          relations.push({
            symbol: refFor(relation.symbol),
            relation: relation.relation,
            confidence: relation.confidence,
            container,
          });
        }
      }

      const containers = [definition, ...relations.map((item) => item.container)];
      return {
        available: true,
        direction: query.direction,
        symbol: refFor(symbol),
        container: definition,
        relations,
        identifierTargets: collectIdentifierTargets(snapshot, containers),
        truncated,
      };
    },
  };
}
