# Phase 11 — GitHub Import

**Status: in progress (2026-10-17).** Depends on: Phase 9 (profiles) and the v1 analyzer. Can run
in parallel with Phase 10 after Phase 9.

## Goal

Let a user paste a public GitHub repository URL and get a tour of it without a
manual clone. The import is a shallow, read-only clone into `SOTHSPELL_HOME`
with strict sandbox rules; no project code ever runs.

## Scope

### In

- A `packages/import` package: URL parsing, clone policy, sandbox layout,
  refresh, and cleanup.
- Public GitHub only (`github.com/owner/repo`, `owner/repo`, optional ref).
- `git clone --depth 1 --single-branch --no-tags` with submodules, LFS, and
  hooks disabled; a wall-clock timeout; a size ceiling.
- Imported clones under `$SOTHSPELL_HOME/projects/imported/<owner>-<repo>-<shortsha>/`,
  marked read-only and analyzed with the existing containment rules.
- Import API routes and an `/import` UI: paste URL, choose ref, watch progress,
  list imports, remove an import.
- CLI: `sothspell import <url> [--ref <ref>]`.
- A generated tour for an imported project uses the same authoring pipeline.
- Clear license and attribution notices; the import records the source URL and
  commit.

### Out

- Private repositories (Phase 12 accounts can add them later).
- Hosted cloning on a server other than the user's machine.
- Running installs, builds, tests, or any project script.
- Automatic import from a list of trending repositories.
- GitLab, Bitbucket, or generic Git hosts (a future adapter behind the same
  port).

## Decisions

1. **Local shallow clone, not a container.** The owner chose a local clone under
   `SOTHSPELL_HOME` with read-only analysis. A container or micro-VM sandbox is
   a future hardening option behind the same `ImportSource` port.
2. **The network boundary is a port.** `GitRemote` wraps the clone so tests use
   a local bare repository over `file://`; no test depends on GitHub.
3. **Allowlist hosts.** Only `github.com` (and `www.github.com`) parse as
   importable. Everything else is rejected with a named error.
4. **No credentials.** Public imports use no token. A token option is reserved
   for private repositories in Phase 12.
5. **Read-only after clone.** The import marks the clone read-only (`chmod`
   where supported) and the analyzer opens files read-only. Sóþspell never
   writes inside the clone; snapshots, tours, and caches live beside it under
   `SOTHSPELL_HOME`.
6. **Refresh by revision.** Re-importing the same repository with the same ref
   fetches only when the remote HEAD moved; a different commit creates a new
   import directory and leaves the old tour pinned to its revision.
7. **Cleanup is explicit.** Removing an import deletes the clone and its
   generated artifacts after a confirmation; the tour is not silently orphaned.

## Waves

### Wave 1 — URL and policy

- `parseGitHubUrl(input)` → `{ owner, repo, ref?, canonicalUrl }` with tests for
  shorthand, HTTPS, `git@`, trailing `.git`, query strings, and rejected hosts.
- `ImportPolicy`: allowed hosts, max bytes, timeout, max files, depth 1,
  submodules/LFS off, no hooks, env scrubbed (`GIT_*` provider variables).
- Tests: parser table, policy rejection messages, path-safety for owner/repo
  names.

### Wave 2 — Clone and sandbox

- `ImportService` with `import({ url, ref })`, `list()`, `remove(id)`, and
  `refresh(id)`.
- `GitRemote` adapter that shells out to `git` with a fixed argument list and a
  scrubbed environment; no shell interpolation.
- Directory naming, revision pinning, partial-import cleanup on failure, and
  size accounting.
- Tests against a local bare repository: shallow clone, ref selection, timeout,
  size ceiling, failure cleanup, read-only marking, idempotent refresh.

### Wave 3 — API and UI

- `POST /api/imports`, `GET /api/imports`, `GET /api/imports/:id`,
  `DELETE /api/imports/:id`, `POST /api/imports/:id/refresh`.
- `/import` page: URL field, optional ref, progress states (queued, cloning,
  analyzing, ready, failed), import list with revision and size, remove with
  confirmation.
- The imported project is selectable as a tour source; the player and code
  browser read from the imported clone.
- Playwright with a mocked import service and a local fixture clone; axe on the
  empty, progress, ready, and error states.

### Wave 4 — CLI, tours, and docs

- `sothspell import <url> [--ref <ref>] [--json]`.
- Authoring for an imported project; anchors carry the imported revision.
- `docs/import.md`: allowed hosts, limits, storage layout, removal, and the
  license notice.
- Bunbun regression: the local Bunbun checkout still works unchanged.

## Test seams

- `packages/import` public API: parser, policy, service, git remote.
- API routes with an injected `ImportService`.
- Web import page with a mocked API.
- Analyzer and authoring against a local fixture clone.

## Bunbun acceptance

Bunbun stays the local read-only checkout; the import phase does not clone it.
The acceptance is:

1. Import a small public fixture repository (or the local fixture remote in
   tests).
2. Analyze it and author a tour.
3. Confirm the clone is read-only and Sóþspell artifacts live under
   `SOTHSPELL_HOME`.
4. Confirm Bunbun is unchanged.

## Exit criteria

- A public GitHub URL imports, analyzes, and authors a tour from the UI and the
  CLI.
- Rejected URLs, oversized repositories, timeouts, and clone failures produce
  named errors and leave no partial directories.
- The clone is read-only, contains no submodules or LFS payloads, and never
  executes project code.
- Imported tours show the source URL and commit.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, browser tests, and
  axe pass.
- Bunbun remains read-only.

## Risks

- **Malicious repositories.** Prompt injection in README files, symlink tricks,
  huge files, and odd Git config are the main threats. The sandbox, redaction,
  bounded context, and read-only analysis are the mitigations; a container
  sandbox remains the stronger future option.
- **Network flakiness.** Clone timeouts and retries must be bounded and visible.
- **Disk growth.** Imports accumulate. List sizes, cap the total, and make
  removal one click.
- **Git availability.** `git` must be installed; `sothspell doctor` gains a
  check and the UI explains the requirement.
- **Rate limits.** Public clone has no API limit, but GitHub may throttle; back
  off and report.

## Working style

- Use `tdd`; build the local bare-repo fixture before the service.
- Never interpolate user input into a shell string; use `execFile` with an
  argument array and a scrubbed environment.
- Keep the analyzer read-only rules unchanged; the import only chooses the root.
- Record the import limits and layout in `docs/import.md` and `CONTEXT.md`.
