# Open a Repository

The web app can open a repository and author a tour without the CLI: a local
git checkout or a public GitHub URL, the fixture or the active authoring
profile, and a progress view that ends in a playable tour.

Open **New tour** from the topbar or the home hero, or go to `/new`.

## Local repository

1. Enter an absolute path to a git repository, for example
   `/Users/you/projects/tiny-notes`.
2. **Check repository** runs a read-only inspection: project name, revision,
   languages, and file count.
3. Choose the model and audience, then **Author the tour**.

The path must be an existing directory inside a git work tree. Sóþspell only
reads it: the snapshot, tour, quality report, and caches live under
`SOTHSPELL_HOME`.

## Public GitHub repository

1. Paste a public `github.com` URL and an optional branch or tag.
2. **Author the tour** runs the import first (a shallow, read-only clone into
   `SOTHSPELL_HOME/projects/imported/`), then analyzes and authors it.

Import limits and safety rules are in [`docs/import.md`](import.md).

## Models

- **Fixture model — offline demo** is deterministic, needs no API key, and
  works without a network. It is the default and the best demo path.
- **Active authoring profile** uses the profile from Settings (or the
  `SOTHSPELL_MODEL` environment override). It is disabled until a profile is
  active.

Real-model runs can take minutes; the job view shows the phase, and **Cancel**
aborts the pipeline.

## What happens

| Phase    | Work                                                                                  |
| -------- | ------------------------------------------------------------------------------------- |
| Import   | (GitHub only) shallow clone and revision pin                                          |
| Analyze  | read-only snapshot: files, symbols, graph, brief                                      |
| Plan     | curriculum with chapter goals and budgets                                             |
| Chapters | bounded context per chapter, validate, repair                                         |
| Validate | anchor and schema checks                                                              |
| Save     | `tour.json` and `quality.json` under `SOTHSPELL_HOME/projects/<slug>/tours/<tourId>/` |

When the job finishes, **Open the tour** deep-links to the first beat of the
new tour; the existing player, code browser, narration, and review surfaces all
work on it.

## API

| Method | Route                          | Purpose                                        |
| ------ | ------------------------------ | ---------------------------------------------- |
| POST   | `/api/projects/inspect`        | Validate a local git path and return a summary |
| POST   | `/api/authoring`               | Start a job (`202` with the job)               |
| GET    | `/api/authoring/:jobId`        | Poll job status, steps, result, or error       |
| POST   | `/api/authoring/:jobId/cancel` | Abort a running job                            |

Jobs are in memory for the local server; the written tour is durable.

## Example repository

`examples/tiny-notes/` is a small TypeScript project built for demos. Use it as
the local path, or create a standalone git repository from it:

```bash
pnpm example:tiny-notes
# prints the path, e.g. ~/.sothspell/example-repos/tiny-notes
```

That path is a real git repository, so it works with **Check repository**. To
demo the GitHub path, push `examples/tiny-notes` as its own public repository
and paste that URL, or use any small public repository such as
`nestjs/typescript-starter` (paste
`https://github.com/nestjs/typescript-starter`).

## Limits and safety

- The local path must be a git repository; other paths are rejected.
- Imported clones are read-only, depth 1, with no submodules, LFS, or hooks.
- Provider keys stay server-side; the browser never sees a secret.
- The project is never modified, and the authoring pipeline never executes
  project code.
- A job that fails reports the source or model error in the job panel; the
  fixture model removes provider errors from the demo path.
