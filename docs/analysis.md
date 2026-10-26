# Repository Analysis

The analyzer turns a local repository into a deterministic, read-only snapshot.
It is the evidence layer for authoring and for anchor resolution. The analyzer
does not call a model and does not store raw source in the snapshot.

## Command

```bash
pnpm sothspell analyze /path/to/project
pnpm sothspell analyze /path/to/project --brief
pnpm sothspell analyze /path/to/project --json
pnpm sothspell analyze /path/to/project --save
pnpm sothspell analyze /path/to/project --out /path/outside/project/snapshot.json
pnpm sothspell analyze /path/to/project --no-cache
```

- `--brief` prints the deterministic project brief as Markdown.
- `--json` prints the full snapshot.
- `--save` writes to `$SOTHSPELL_HOME/projects/<slug>/snapshot.json`.
- `--out` writes to an explicit path outside the project.
- `--no-cache` ignores the per-file parse cache.

The default `SOTHSPELL_HOME` is `~/.sothspell`.

## What a snapshot contains

- `project`: slug, name, and a root fingerprint (never the absolute path).
- `revision`: commit, branch, and dirty state.
- `files`: path, language, bytes, hash, line count, binary/redacted flags, mtime.
- `languages`: file, byte, and line counts per language.
- `packages`: workspace package manifests.
- `docs`: `README`, `CONTEXT`, `docs/`, and `plans/` titles and summaries.
- `prismaModels`: models and fields from a Prisma contract/schema.
- `symbols`: modules, classes, methods, properties, functions, variables,
  interfaces, types, enums, namespaces, and objects with stable IDs.
- `graph`: resolved file imports, package imports, import-based reference
  edges, symbol-level `calls` edges with call-site lines, and entry points.
- `warnings`: redacted, binary, large-file, and parse-error notes.
- `analysis`: duration, cache hit/miss counts, and unresolved-call count (not
  part of the snapshot ID).

## Read-only guarantees

- Paths are resolved with `realpath` and must stay inside the project root; a
  symlink that escapes the root is refused.
- `.gitignore` rules are honoured relative to each ignore file, with build,
  vendor, test-report, and worktree directories denied by default.
- File content is read only. The analyzer never executes project code and never
  writes inside the project.
- Secret-like files are hashed and marked `redacted`. They may be parsed for
  symbol names, but their signatures, decorators, and raw text never reach the
  snapshot. Raw source is not stored anywhere in the snapshot.
- `--out` refuses a path inside the project root.
- The Bunbun acceptance test asserts `git status --porcelain` is empty before
  and after analysis.

## Incremental cache

Each parseable source file is cached by:

```
analyzer version + path + language + content hash + redacted flag
```

Unchanged files are loaded from `$SOTHSPELL_HOME/cache/analysis`; changed files
are re-parsed. The snapshot ID depends on the analyzer and ignore versions, the
root fingerprint, the revision, and the file manifest, so it is stable across
cache hits and changes when content changes.

On Bunbun at `9fef24d` the cold analysis is under a second on the development
machine (about 0.8 s), and a warm run is about 0.17 s with 478 file-cache hits.

## Symbol IDs

```text
symbol:<path>                         # file/module
symbol:<path>#<QualifiedName>         # class, function, type, ...
symbol:<path>#<Class>.<method>        # member
```

The ID is the anchor target for a tour. The resolver prefers a symbol's range,
falls back to the anchor's line hint when the excerpt hash requires it, and
verifies the content hash before a tour can cite the code.

## Call and relation index

`ANALYZER_VERSION` is `0.4.0`. The TypeScript/JavaScript adapter records
unresolved call sites per file and the project pass resolves them into `calls`
edges:

- same-file functions and same-class methods;
- typed `this` members, including constructor parameter properties such as
  `private readonly service: CommentsService`;
- imported and aliased exported bindings;
- unresolved or ambiguous calls are dropped and counted in
  `analysis.unresolvedCalls`.

Import and reference edges carry the import statement line; call edges carry the
call-site line. The canvas relation API uses these edges to open callers and
callees, preferring calls, then references, then imports. Python, Go, Rust, and
Java currently contribute imports/references only; the UI labels them as such.

On Bunbun at `9fef24d`, the analyzer emits 6,642 call edges and 22,923 unresolved
calls.

## Language support

Language support is a `LanguageAnalyzer` port; the TypeScript/JavaScript
adapter wraps the original `oxc-parser` path, and Python, Go, Rust, and Java use
prebuilt WASM tree-sitter grammars loaded lazily per detected language.

| Language                | Parser       | Symbols                                                | Imports                                                                                                       | Manifest                             | Entry points                               |
| ----------------------- | ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------ |
| TypeScript / JavaScript | `oxc-parser` | full                                                   | file edges                                                                                                    | `package.json`                       | scripts, app entry files                   |
| Python                  | tree-sitter  | functions, classes, methods, decorators                | absolute imports resolve against root/`src`/`lib` or become external                                          | `pyproject.toml`, `requirements.txt` | `__main__.py`, `if __name__ == "__main__"` |
| Go                      | tree-sitter  | packages, structs, interfaces, funcs, methods          | module paths are external nodes                                                                               | `go.mod`                             | `package main`, `func main`                |
| Rust                    | tree-sitter  | modules, structs, enums, traits, impl methods          | `mod`/`crate::`/`self::`/`super::` resolve; crates are external                                               | `Cargo.toml`                         | `fn main`                                  |
| Java                    | tree-sitter  | packages, classes, interfaces, enums, records, methods | package-qualified imports resolve under `src/main/java`, `src/test/java`, `src`; wildcard/static are external | `pom.xml`, `build.gradle(.kts)`      | `public static void main`                  |

Notes:

- No language runtime is required and no project code runs.
- A snapshot records `languages` (per-file languages with an `id` and one
  `primary`) and `manifests`; the brief adds a `languageBriefs` section with
  build systems, entry points, module layout, notable symbols, and per-language
  limits.
- Parsing is best-effort: a dropped symbol falls back to the line hint, and the
  content hash still verifies the anchor.
- Code pages highlight `.py`, `.pyi`, `.go`, `.rs`, and `.java` through Shiki;
  the four grammars add about 9.7 kB gzip to the web bundle.
- `ANALYZER_VERSION` is `0.4.0`; version bumps invalidate the per-file cache and
  change snapshot ids.

## Project brief

`buildProjectBrief(snapshot)` is deterministic and model-ready. It includes the
workspace kind and packages, applications and entry points, feature modules
under `apps/api/src`, docs and plans, Prisma models, and graph statistics. The
Markdown renderer is the human-facing form used by `--brief`.
