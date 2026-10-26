import type { FileAnalysis, GraphEdge, SymbolKind, SymbolNode } from './types.js';

const CALLABLE_KINDS: ReadonlySet<SymbolKind> = new Set(['function', 'method']);

export interface CallResolutionInput {
  symbols: readonly SymbolNode[];
  analyses: ReadonlyMap<string, FileAnalysis>;
  resolveSpecifier(fromPath: string, specifier: string): string | null;
}

export interface CallResolution {
  edges: GraphEdge[];
  unresolvedCalls: number;
}

function uniqueSymbols(candidates: SymbolNode[]): SymbolNode[] {
  return [...new Map(candidates.map((symbol) => [symbol.id, symbol])).values()];
}

function one(candidates: SymbolNode[]): SymbolNode | null {
  const unique = uniqueSymbols(candidates);
  return unique.length === 1 ? (unique[0] ?? null) : null;
}

/**
 * Resolves the call sites every TypeScript/JavaScript file recorded after all
 * files are parsed, because a callee can live in another module. Resolution is
 * deliberately narrow: a same-file declaration, a same-class method, a typed
 * `this` member, or an imported export. Anything else is dropped and counted;
 * a member name alone is never treated as proof.
 */
export function resolveCallEdges(input: CallResolutionInput): CallResolution {
  const byPath = new Map<string, SymbolNode[]>();
  const byId = new Map<string, SymbolNode>();
  const byParent = new Map<string, SymbolNode[]>();
  for (const symbol of input.symbols) {
    byId.set(symbol.id, symbol);
    const pathEntries = byPath.get(symbol.path) ?? [];
    pathEntries.push(symbol);
    byPath.set(symbol.path, pathEntries);
    if (symbol.parentId !== null) {
      const children = byParent.get(symbol.parentId) ?? [];
      children.push(symbol);
      byParent.set(symbol.parentId, children);
    }
  }

  const exportsByPath = new Map<string, Map<string, SymbolNode[]>>();
  for (const symbol of input.symbols) {
    if (!symbol.exported || symbol.kind === 'module') {
      continue;
    }
    const exports = exportsByPath.get(symbol.path) ?? new Map<string, SymbolNode[]>();
    for (const name of new Set([
      symbol.name,
      symbol.qualifiedName.split('.').pop() ?? symbol.name,
    ])) {
      const entries = exports.get(name) ?? [];
      if (!entries.some((entry) => entry.id === symbol.id)) {
        entries.push(symbol);
      }
      exports.set(name, entries);
    }
    exportsByPath.set(symbol.path, exports);
  }

  const classOf = (symbol: SymbolNode): SymbolNode | null => {
    let current: SymbolNode | undefined = symbol;
    while (current) {
      if (current.kind === 'class') {
        return current;
      }
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
    return null;
  };

  const classesNamed = (path: string, typeName: string): SymbolNode[] =>
    (byPath.get(path) ?? []).filter(
      (symbol) =>
        symbol.kind === 'class' &&
        (symbol.name === typeName || symbol.qualifiedName === typeName),
    );

  const importedClass = (
    fromPath: string,
    typeName: string,
    usedImport: { value: boolean },
  ): SymbolNode | null => {
    const analysis = input.analyses.get(fromPath);
    if (!analysis) {
      return null;
    }
    const candidates: SymbolNode[] = [];
    for (const imported of analysis.imports) {
      for (const binding of imported.bindings) {
        if (binding.local !== typeName) {
          continue;
        }
        const resolvedPath = input.resolveSpecifier(fromPath, imported.specifier);
        const exported = resolvedPath
          ? (exportsByPath.get(resolvedPath)?.get(binding.imported) ?? [])
          : [];
        candidates.push(...exported.filter((symbol) => symbol.kind === 'class'));
      }
    }
    const match = one(candidates);
    if (match) {
      usedImport.value = true;
    }
    return match;
  };

  const resolveTypeName = (
    typeName: string,
    fromPath: string,
    usedImport: { value: boolean },
  ): SymbolNode | null => {
    const local = classesNamed(fromPath, typeName);
    if (local.length > 1) {
      return null;
    }
    if (local[0]) {
      return local[0];
    }
    return importedClass(fromPath, typeName, usedImport);
  };

  const resolveMemberClass = (
    classSymbol: SymbolNode,
    member: string,
    usedImport: { value: boolean },
  ): SymbolNode | null => {
    const entries = (input.analyses.get(classSymbol.path)?.memberTypes ?? []).filter(
      (entry) => entry.className === classSymbol.qualifiedName && entry.member === member,
    );
    const typeNames = [...new Set(entries.map((entry) => entry.typeName))];
    if (typeNames.length !== 1) {
      return null;
    }
    return resolveTypeName(typeNames[0] ?? '', classSymbol.path, usedImport);
  };

  const resolveMethod = (classSymbol: SymbolNode, member: string): SymbolNode | null =>
    one(
      (byParent.get(classSymbol.id) ?? []).filter(
        (symbol) => symbol.kind === 'method' && symbol.name === member,
      ),
    );

  const resolveImportedCallable = (
    fromPath: string,
    localName: string,
    usedImport: { value: boolean },
  ): SymbolNode | null => {
    const analysis = input.analyses.get(fromPath);
    if (!analysis) {
      return null;
    }
    const candidates: SymbolNode[] = [];
    for (const imported of analysis.imports) {
      for (const binding of imported.bindings) {
        if (binding.local !== localName) {
          continue;
        }
        const resolvedPath = input.resolveSpecifier(fromPath, imported.specifier);
        const exported = resolvedPath
          ? (exportsByPath.get(resolvedPath)?.get(binding.imported) ?? [])
          : [];
        candidates.push(...exported.filter((symbol) => CALLABLE_KINDS.has(symbol.kind)));
      }
    }
    const match = one(candidates);
    if (match) {
      usedImport.value = true;
    }
    return match;
  };

  const resolveBareCall = (
    path: string,
    caller: SymbolNode,
    callee: string,
    usedImport: { value: boolean },
  ): SymbolNode | null => {
    const direct = one(
      (byPath.get(path) ?? []).filter(
        (symbol) =>
          CALLABLE_KINDS.has(symbol.kind) &&
          (symbol.qualifiedName === callee ||
            (symbol.parentId === caller.id && symbol.name === callee)),
      ),
    );
    if (direct) {
      return direct;
    }

    const callerClass = classOf(caller);
    const method = callerClass ? resolveMethod(callerClass, callee) : null;
    if (method) {
      return method;
    }

    return resolveImportedCallable(path, callee, usedImport);
  };

  const resolveMemberCall = (
    caller: SymbolNode,
    callee: string,
    member: string,
    usedImport: { value: boolean },
  ): SymbolNode | null => {
    const callerClass = classOf(caller);
    if (!callerClass) {
      return null;
    }
    if (callee === 'this') {
      return resolveMethod(callerClass, member);
    }
    if (!callee.startsWith('this.')) {
      return null;
    }

    let receiver: SymbolNode | null = callerClass;
    const parts = callee.slice('this.'.length).split('.');
    for (const part of parts) {
      if (!receiver || part.length === 0) {
        return null;
      }
      receiver = resolveMemberClass(receiver, part, usedImport);
    }
    return receiver ? resolveMethod(receiver, member) : null;
  };

  const edges: GraphEdge[] = [];
  let unresolvedCalls = 0;

  for (const [path, analysis] of input.analyses) {
    for (const site of analysis.callSites ?? []) {
      const callers = (byPath.get(path) ?? []).filter(
        (symbol) => symbol.qualifiedName === site.fromQualifiedName,
      );
      const caller =
        one(callers.filter((symbol) => symbol.kind !== 'module')) ??
        (site.fromQualifiedName === ''
          ? one(callers.filter((symbol) => symbol.kind === 'module'))
          : null);
      if (!caller) {
        unresolvedCalls += 1;
        continue;
      }

      const usedImport = { value: false };
      const target =
        site.member === undefined
          ? resolveBareCall(path, caller, site.callee, usedImport)
          : resolveMemberCall(caller, site.callee, site.member, usedImport);
      if (!target) {
        unresolvedCalls += 1;
        continue;
      }
      edges.push({
        from: caller.id,
        to: target.id,
        kind: 'calls',
        confidence: usedImport.value ? 'import' : 'syntax',
        atLine: site.line,
      });
    }
  }

  return { edges, unresolvedCalls };
}
