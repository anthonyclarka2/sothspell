# Phase 13 — Language Analyzers

**Status: planned.** Depends on: the v1 analyzer and Phase 11 (imported
repositories). Can run in parallel with Phase 12 after Phase 9.

## Goal

Analyze Python, Go, Rust, and Java projects with the same snapshot, symbol,
brief, and anchor guarantees as TypeScript. Language support is an adapter
behind one `LanguageAnalyzer` port; the rest of the pipeline does not change.

## Scope

### In

- A `LanguageAnalyzer` port in `packages/analyzer`: detect, parse, symbols,
  imports/references, entry points, manifests, and docs.
- The existing TypeScript/JavaScript analyzer becomes the first adapter.
- Python, Go, Rust, and Java adapters built on tree-sitter grammars
  (`web-tree-sitter` or the WASM grammar packages) with no language runtime
  execution.
- Per-language manifests: `pyproject.toml`/`requirements.txt`, `go.mod`,
  `Cargo.toml`, `pom.xml`/`build.gradle`.
- Deterministic snapshots and a unified symbol model with per-language kind
  mapping.
- Anchor resolution for symbols with content-hash verification, exactly as v1.
- Fixture repositories per language and a multi-language Bunbun regression
  (Bunbun stays the TS project).
- `sothspell analyze` reports the detected language mix.

### Out

- Running the project, its package manager, its tests, or its type checker.
- Full type inference or cross-language call graphs.
- Ruby, C#, C++, PHP, Kotlin, Scala (future adapters behind the same port).
- Rename refactoring or code editing.

## Decisions

1. **Tree-sitter grammars, not language runtimes.** Parsing must work without
   Python, Go, Rust, or Java installed. Grammar packages are pinned and loaded
   from WASM where possible.
2. **One symbol model.** Language adapters map to the existing symbol kinds
   (`class`, `function`, `method`, `interface`, `type`, `variable`, `module`,
   `model`). Unknown kinds map to `other` with the language recorded.
3. **Anchors verify by hash, not by parser confidence.** A weak symbol match
   falls back to the line hint; the content hash is the source of truth.
4. **Imports are best-effort.** Each adapter extracts module imports for the
   dependency graph; unresolved imports become external nodes, never errors.
5. **Detection is explicit and ordered.** A project can contain several
   languages; the snapshot records per-language file counts and a primary
   language chosen by source bytes.
6. **No execution, no installs.** The analyzer never runs `pip`, `go`, `cargo`,
   `mvn`, or a project binary.
7. **Fixtures are tiny and licensed.** Each fixture is hand-written, MIT-licensed
   content with a known symbol graph and expected anchors.

## Waves

### Wave 1 — Port and TypeScript extraction

- Define `LanguageAnalyzer` and `LanguageDetection`; move the existing TS/JS
  logic behind the port with no behavior change.
- Snapshot shape gains `languages: Array<{ id, files, bytes, primary }>`.
- Tests: the full v1 analyzer suite stays green; detection on mixed projects.

### Wave 2 — Python and Go

- Python: functions, classes, methods, decorators, `import`/`from` forms,
  `pyproject.toml`/`requirements.txt` signals, entry points (`__main__`,
  console scripts).
- Go: packages, structs, interfaces, funcs, methods, imports, `go.mod` module
  and dependencies, `main` packages.
- Fixtures and deterministic snapshot tests for both.

### Wave 3 — Rust and Java

- Rust: modules, structs, enums, traits, impl methods, `use` statements,
  `Cargo.toml` crate/dependencies, `fn main`.
- Java: packages, classes, interfaces, enums, records, methods, imports,
  `pom.xml`/`build.gradle` coordinates and dependencies.
- Fixtures and deterministic snapshot tests for both.

### Wave 4 — Briefs, authoring, and docs

- Project briefs for each language: build system, entry points, module layout,
  notable symbols, and language-specific risks.
- Authoring context packs pick candidates across languages with the same budget
  rules.
- `docs/analysis.md` gains a language-support matrix and per-language limits.
- End-to-end: analyze, author, and play a fixture tour for each language.

## Test seams

- `packages/analyzer` port and each adapter's public functions.
- Snapshot determinism: same fixture, same JSON.
- Anchor resolution: symbol match, hash fallback, stale detection.
- Authoring context packs over multi-language snapshots.
- API and player against a fixture snapshot.

## Bunbun acceptance

Bunbun remains the TypeScript acceptance project and must be unchanged. The
language acceptance uses four fixture repositories:

1. Analyze each fixture; symbols, imports, and brief are present.
2. Author a short tour for one fixture per language.
3. Compile anchors and verify hashes.
4. Confirm Bunbun is unchanged.

## Exit criteria

- Python, Go, Rust, and Java fixtures produce deterministic snapshots, symbols,
  imports, and briefs.
- A tour can be authored and played for each fixture.
- Anchor verification works for each language, including stale detection.
- The TypeScript suite and the golden Bunbun tour are unchanged.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, browser tests, and
  axe pass.
- Bunbun remains read-only.

## Risks

- **Parser quality.** Tree-sitter grammars vary in maturity. Symbols are
  best-effort; hash-verified anchors prevent false claims.
- **Grammar size and load time.** WASM grammars add bundle weight. Load lazily
  per detected language and measure startup.
- **Manifest parsing.** Build files are not regular. Parse only what the brief
  needs; keep a raw excerpt anchor for the manifest itself.
- **Detection ambiguity.** Monorepos mix languages. Report the mix and let the
  authoring budget choose; never guess a single language for a polyglot repo.
- **Fixture drift.** Pin grammar versions and fixture hashes; a grammar upgrade
  is a reviewed change with snapshot updates.

## Working style

- Use `tdd` per adapter; snapshot tests are the contract.
- Keep adapters pure and synchronous where possible; parsing must not touch the
  network or run project tools.
- Record language decisions in `docs/analysis.md` and `CONTEXT.md`.
- One adapter per wave; do not merge two new languages in one commit.
