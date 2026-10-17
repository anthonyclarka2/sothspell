# GitHub Import

A public GitHub repository can be imported without a manual clone. The import is
a shallow, read-only clone into `SOTHSPELL_HOME`; the project is then analyzed
and toured like any local checkout.

## URL forms

Accepted:

```
github.com/owner/repo
https://github.com/owner/repo
https://github.com/owner/repo.git
https://github.com/owner/repo/tree/<ref>
git@github.com:owner/repo.git
owner/repo
```

Only `github.com` (and `www.github.com`) is allowed. Other hosts, malformed
URLs, and traversal in owner/repo names are rejected with named errors. Private
repositories are not supported in this phase.

## Sandbox

```
$SOTHSPELL_HOME/projects/imported/<owner>-<repo>-<shortsha>/
  ...                 the read-only clone
<owner>-<repo>-<shortsha>.json   the import record
```

- `git clone --depth 1 --single-branch --no-tags` with submodules, LFS, and
  hooks disabled; a scrubbed `GIT_*` environment; a wall-clock timeout and
  byte/file ceilings.
- The clone is marked read-only after the revision is pinned. Sóþspell never
  writes inside it; metadata lives beside it.
- No project code runs: no installs, builds, tests, or project binaries.
- Cloning uses `execFile` with a fixed argument array; user input is never
  interpolated into a shell string.

## Limits

- Depth 1, one branch, no tags or submodules.
- A byte ceiling and a file-count ceiling; failures clean up partial
  directories.
- A clone timeout maps to 504; an oversized repository maps to 507.

## API and UI

| Method | Route                      | Purpose                                             |
| ------ | -------------------------- | --------------------------------------------------- |
| POST   | `/api/imports`             | Import a URL (409 when the revision already exists) |
| GET    | `/api/imports`             | List imports                                        |
| GET    | `/api/imports/:id`         | One import                                          |
| POST   | `/api/imports/:id/refresh` | Refresh (moved HEAD creates a new pinned import)    |
| DELETE | `/api/imports/:id`         | Remove the clone and record                         |

`/import` shows the URL and optional ref, progress states (queued, cloning,
analyzing, ready, failed), the import list with revision and size, and a
confirmation before removal. `sothspell import <url> [--ref <ref>] [--json]`
does the same from the CLI.

## Refresh semantics

Re-importing the same repository and ref at the same commit is idempotent. When
the remote HEAD moves, refresh creates a new import directory and leaves the old
tour pinned to its original revision.

## Requirements and notices

- `git` must be installed; `sothspell doctor` reports it.
- Only public repositories are imported; the import record keeps the source URL
  and commit for attribution.
- A container or micro-VM sandbox is a future hardening option behind the same
  import port.
