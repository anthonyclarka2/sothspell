# Architecture

Sóþspell is a pnpm workspace with a local-first runtime.

```
apps/web        React 19 + Vite 8 player and code browser
apps/api        Hono API, source route, audio route, SQLite runs
apps/cli        analyze / author / serve / doctor
packages/core   schema, source access, Shiki highlighting, compiler
packages/analyzer  read-only snapshots, symbols, graph, brief, anchors
packages/authoring GuideModel, context packs, curriculum, chapters, ask, drilldown
packages/player playback state machine and narration synchronization helpers
packages/narration sentence splitting, alignment, browser speech, ElevenLabs, store
packages/diagram diagram IR, ELK layout, sequence model
packages/harness harness adapter contract (reserved)
```

## Pipeline

```
local repository (read-only)
  -> analyzer snapshot
  -> project brief + context pack
  -> authoring model calls
  -> validation / repair
  -> Sóþspell document
  -> compiler (anchors + Shiki + ELK)
  -> player
  -> run (IndexedDB + SQLite mirror)
```

## Trust boundaries

- The analyzer and compiler read the project; nothing writes to it.
- The source route can read full files only under `SOTHSPELL_PROJECT_ROOT`,
  through `realpath` containment.
- Model and audio provider keys stay on the server.
- Tour documents never carry executable presentation code.
- The local API binds to `127.0.0.1` by default.

## Storage

```
$SOTHSPELL_HOME/
  sothspell.db              projects, runs, answers
  audio/<hash>.mp3|json     cloud narration + alignment
  cache/analysis/           per-file parse cache
  cache/authoring/llm/      model-call cache
  projects/<slug>/          snapshots and generated tours
```

## Runtime boundaries

- `GuideModel` isolates provider-specific structured generation.
- `NarrationAssetStore` isolates audio persistence.
- `ProgressStore` is local-first; the SQLite mirror is a durability copy.
- `HarnessAdapter` is reserved for the OpenCode plugin and future harnesses.
