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
- `graph`: resolved file imports, package imports, approximate import-based
  reference edges, and entry points.
- `warnings`: redacted, binary, large-file, and parse-error notes.
- `analysis`: duration and cache hit/miss counts (not part of the snapshot ID).

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

## Project brief

`buildProjectBrief(snapshot)` is deterministic and model-ready. It includes the
workspace kind and packages, applications and entry points, feature modules
under `apps/api/src`, docs and plans, Prisma models, and graph statistics. The
Markdown renderer is the human-facing form used by `--brief`.
