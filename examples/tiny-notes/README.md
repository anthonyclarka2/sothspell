# tiny-notes

A small, self-contained TypeScript note service with a layered architecture:
a JSON file store at the bottom, a note repository and service in the middle,
and a CLI and a JSON HTTP API on top. It runs on Node 26 with no runtime
dependencies, and the whole thing is small enough to read in one sitting.

## Architecture

| Path                        | Responsibility                                      |
| --------------------------- | --------------------------------------------------- |
| `src/types.ts`              | The `Note` model, queries, summaries, and errors.   |
| `src/storage/file-store.ts` | JSON document storage with atomic writes.           |
| `src/notes/repository.ts`   | Note persistence: create, list, find, save, remove. |
| `src/notes/service.ts`      | Use cases: add, search, archive, remove, summary.   |
| `src/notes/format.ts`       | Plain-text and Markdown rendering for the CLI.      |
| `src/http/server.ts`        | `node:http` JSON API over the service.              |
| `src/cli.ts`                | The `tiny-notes` command line.                      |
| `src/index.ts`              | The public entry that wires the layers together.    |

Each layer only imports from the layer below it: the CLI and the HTTP adapter
call the service, the service calls the repository, and the repository calls
the store. The service never sees a file path and the store never sees a note.

## Running

```bash
node src/cli.ts add "First note" --tag demo
node src/cli.ts list
node src/cli.ts serve          # JSON API on http://127.0.0.1:4321
node --test test/              # behavior tests, no dependencies
```

The notes file defaults to `./.tiny-notes/notes.json`; set `TINY_NOTES_FILE` to
keep data somewhere else.

## How this example is used

`tiny-notes` is the demo repository for the Sóþspell web "Open a repository"
flow. `scripts/make-example-repo.mjs` copies this directory into
`$SOTHSPELL_HOME/example-repos/tiny-notes` and initializes a git repository
with one commit, so the flow has a small, real, stable project to analyze,
author, and play without touching any other checkout.
