# Phase 8 — Self-Hosted Release & Hardening

**Status: in progress (2026-10-17).** Depends on: Phases 1–7; packaging work may
start during Phase 7.

**Deliverable:** a reproducible self-hosted release: one command to install and
serve, a packaged CLI and OpenCode plugin, a secure loopback server, performance
budgets, complete documentation, and a release verification that replays the
Bunbun golden tour without touching the Bunbun tree.

## Goal

Turn the working system into something a developer can install, trust, and run
on their own machine. The release is not a hosted SaaS; it is a local tool with a
web UI and an OpenCode plugin.

The release gate is evidence: fresh install, typecheck, tests, browser
acceptance, accessibility, build, a real Bunbun tour, and a clean Bunbun tree.

## Why this order

- Packaging needs the stable API, authoring pipeline, player, and plugin.
- Security and performance hardening need the real paths and fixtures.
- Documentation must describe the final commands and storage layout.
- The release should not be declared on unit tests alone.

## Scope

### In scope

- `pnpm build`, `sothspell serve`, and a packaged CLI.
- Static web assets served by Hono.
- SQLite migrations and `SOTHSPELL_HOME` initialization.
- Configuration, health, graceful shutdown, and logs.
- Optional Dockerfile for self-hosting.
- Security review and fixes.
- Performance budgets and measurement.
- Reliability: retries, cancellation, resumable generation, error states.
- Documentation: README, architecture, authoring, plugin, privacy, self-hosting,
  accessibility, troubleshooting.
- Release verification and a versioned artifact.
- Harness SDK documentation and a future-adapter note.

### Out of scope

- Hosted multi-tenant SaaS.
- GitHub cloning or private-repository OAuth.
- Accounts, teams, billing, or collaboration.
- Additional harness adapters beyond OpenCode (future track).
- Mobile apps.

## Decisions

1. **One Node process + one data directory.** Hono serves the API and the built
   web app; SQLite and artifacts live under `SOTHSPELL_HOME`.
2. **Loopback by default.** `127.0.0.1`; remote binding is opt-in, warned, and
   documented.
3. **No source writes.** The release test asserts the Bunbun tree is unchanged.
4. **No hidden telemetry.** Local logs only; no third-party analytics.
5. **Cloud calls are explicit.** Model and TTS providers are selected by the
   user; source excerpts and narration text are disclosed.
6. **Reproducible installs.** Pin pnpm and dependency versions; commit the
   lockfile; use `pnpm install --frozen-lockfile` in verification.
7. **Golden tour is the release fixture.** It must compile and play after a fresh
   clone without a model or network.
8. **One release artifact.** A tarball or npm package is enough for the first
   release; Docker is a convenience, not the only path.

## Waves

### Wave 0 — Packaging and CLI

1. Build pipeline:
   - `pnpm build` builds all packages and the web app;
   - the API serves `apps/web/dist` with hashed assets;
   - server-rendered routes and SPA fallback are defined;
   - static assets use long-lived immutable caching.
2. CLI commands:
   ```bash
   sothspell serve [--port 4319] [--host 127.0.0.1] [--open]
   sothspell analyze <path> [--json]
   sothspell author <path> [--out <dir>] [--model <id>]
   sothspell export <runId> [--out <file>]
   sothspell import <file>
   sothspell doctor
   ```
3. `sothspell doctor` checks:
   - Node version;
   - TypeScript 7 toolchain;
   - `SOTHSPELL_HOME` writability;
   - SQLite availability;
   - model provider configuration (without printing keys);
   - optional TTS configuration;
   - Bunbun checkout presence (for the demo);
   - port availability.
4. Graceful shutdown:
   - close the HTTP listener;
   - close SQLite;
   - stop workers;
   - flush logs;
   - exit non-zero on a failed boot.
5. Tests:
   - CLI help/exit codes;
   - `doctor` with missing config;
   - clean shutdown;
   - static asset fallback.

### Wave 1 — Storage and migrations

1. SQLite schema:
   - `projects`;
   - `snapshots`;
   - `tours`;
   - `runs`;
   - `answers`;
   - `audio_assets`;
   - `schema_migrations`.
2. Plain SQL migrations under `apps/api/migrations/`;
   - a migration runner checks `schema_migrations`;
   - migrations are transactional;
   - a failed migration rolls back and leaves the database usable.
3. `SOTHSPELL_HOME` initialization:
   - create directories with user-only permissions;
   - create the signing secret atomically;
   - fail clearly if the home is not writable.
4. Backup/restore:
   - `sothspell export --all` and `sothspell import --all` for tours/runs;
   - document that source snapshots can be regenerated.
5. Tests:
   - fresh DB;
   - upgrade from an earlier schema fixture;
   - failed migration;
   - read-only home error.

### Wave 2 — Security hardening

1. Path safety:
   - allowlist roots;
   - `realpath` containment;
   - symlink race check (open with `O_NOFOLLOW` where supported);
   - deny devices, sockets, and oversized files.
2. HTTP:
   - strict CSP with hashed assets;
   - `Origin` checks on state-changing routes;
   - CSRF token for forms if forms exist;
   - signed anonymous session cookie;
   - rate limits on ask/generate/audio;
   - body size limits;
   - request timeouts.
3. Secrets:
   - API keys only in server env;
   - redacted logs;
   - secret scanning before model/TTS calls;
   - no keys in crash reports.
4. Model output:
   - restricted Markdown, no raw HTML;
   - schema-only diagrams/tours;
   - URL allowlist for links (project/code/tour routes only);
   - no `javascript:` or `data:` links.
5. Local server:
   - default host `127.0.0.1`;
   - remote host requires `--allow-remote` and prints a warning;
   - no directory listing;
   - no static serving outside the web build.
6. Dependency audit:
   - `pnpm audit` (or equivalent) with documented exceptions;
   - check native modules (`better-sqlite3`) against the Node version.
7. Tests:
   - traversal/symlink race fixture;
   - cross-origin POST rejected;
   - tampered cookie rejected;
   - oversized body rejected;
   - malicious Markdown/URL rejected;
   - secret redaction in logs.

### Wave 3 — Reliability and performance

1. Generation:
   - retry transient provider failures with jitter;
   - cancel on user request;
   - resume from the last completed chapter;
   - never overwrite a valid tour with a partial one;
   - a failed audio beat falls back to browser/text.
2. Playback:
   - recover from malformed runs;
   - show a readable error for a stale tour;
   - no unhandled promise rejections;
   - server restart does not lose a saved run.
3. Performance budgets:
   - analyze Bunbun under 60 s and 1 GB RSS;
   - player route LCP under 2.5 s on the local server;
   - initial player bundle under 500 kB gzipped;
   - diagram layout under 100 ms per diagram;
   - code page first render under 300 ms for a 1,000-line file;
   - no layout shift over 0.1.
4. Load:
   - a single-user local server; test 10 concurrent API requests and one
     generation;
   - rate-limit behavior.
5. Tests:
   - provider retry/failure;
   - partial tour protection;
   - performance measurements recorded as JSON.

### Wave 4 — Documentation

1. `README.md`:
   - what Sóþspell is;
   - screenshot or short demo description;
   - install and run;
   - Bunbun golden tour;
   - OpenCode plugin;
   - privacy and limitations.
2. `docs/`:
   - `architecture.md` — modules, data flow, storage;
   - `authoring.md` — how tours are generated, prompts, validation, quality
     report;
   - `tour-format.md` — schema and versioning;
   - `player.md` — modes, controls, keyboard, progress;
   - `narration.md` — adapters, caching, privacy;
   - `opencode-plugin.md` — install, commands, tools, RPC;
   - `self-hosting.md` — config, storage, backup, upgrades;
   - `privacy.md` — what leaves the machine;
   - `accessibility.md` — gate, keyboard pass, known gaps;
   - `troubleshooting.md` — common errors;
   - `development.md` — workspace, tests, version policy.
3. Update `CONTEXT.md` and `AGENTS.md` with final commands and repository map.
4. Keep `plans/ROADMAP.md` status current; archive superseded plans if needed.
5. Write a release note with the version, date, Bunbun commit, dependency
   versions, and known limitations.

### Wave 5 — Release verification and closure

Run from a fresh checkout or a clean clone into a new directory:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:browser
pnpm test:a11y
pnpm sothspell doctor
pnpm sothspell serve --no-open
```

Then:

1. Open the golden Bunbun tour; play it end to end in read mode.
2. Play it with browser narration.
3. Play it with cached cloud narration.
4. Ask two questions and continue.
5. Drill into `CommentsService.create`.
6. Reload and resume.
7. Restart the server and resume.
8. Export/import the run.
9. Open the OpenCode plugin in a temp project; run `/sothspell`; verify the
   player and RPC.
10. Run the plugin against Bunbun; verify the player opens and Bunbun's git
    status is empty.
11. Run `git -C /Users/ajc/Projects/codegens/bunbun status --porcelain` and
    assert empty.

Closure evidence:

- command outputs for each gate;
- performance JSON;
- audio cache size/cost;
- bundle size and LCP;
- list of known limitations;
- release artifact checksum;
- exact Bunbun commit used (`9fef24d`).

## Test seams

Confirm before the first test:

1. `sothspell serve` lifecycle and health.
2. Storage migrations and `SOTHSPELL_HOME` initialization.
3. Security boundary (path, origin, cookie, body, URL).
4. CLI commands and exit codes.
5. Release journey in Playwright.

What they cover and miss:

- Lifecycle: catches boot/shutdown; misses OS-specific daemon behavior.
- Storage: catches migrations and corruption; misses long-term data growth.
- Security: catches known classes; misses novel attacks and manual review.
- CLI: catches command behavior; misses packaging edge cases.
- Release journey: catches the integrated product; not a substitute for a
  real user study.

## Exit criteria (measurable)

1. A fresh clone installs with `pnpm install --frozen-lockfile` and passes
   `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.
2. `pnpm test:browser` and `pnpm test:a11y` are green; axe is 0 critical/serious.
3. The golden Bunbun tour compiles and plays without a model or network.
4. The narrated tour works with browser and cached cloud audio.
5. The OpenCode plugin loads, opens the player, and shares progress.
6. The Bunbun tree is unchanged after the full release journey.
7. Performance budgets in §Wave 3 are met or explicitly waived with a recorded
   reason.
8. `sothspell doctor` passes on a clean machine with a clear message for missing
   optional configuration.
9. Documentation covers install, authoring, player, plugin, privacy, storage,
   accessibility, and troubleshooting.
10. A versioned release artifact is produced with a checksum and release note.
11. No unresolved critical security finding.
12. No unassigned “future work” note that the first release depends on; deferred
    items have a named future track.

## Risks and mitigations

- **Native dependency packaging.** `better-sqlite3` must match the Node ABI. Test
  the packed install on the target Node version; provide a clear `doctor` error.
- **Local server attack surface.** Loopback only, origin checks, CSP, signed
  sessions, rate limits, and no remote binding by default.
- **Model/TTS provider changes.** Adapters behind ports; pin SDK versions; keep a
  text-only path.
- **Performance regressions.** Record budgets and run the measurement script in
  the release gate.
- **Docs drift.** Treat docs as part of the release gate; update the phase plan
  and roadmap when behavior changes.
- **Golden tour staleness.** Pin Bunbun `9fef24d`; regenerate only with a review
  note and new hashes.
- **Scope creep.** The first release is self-hosted and single-user. Hosted
  collaboration is a future product decision, not a release blocker.

## Future track (not part of this release)

- Additional harness plugins (Claude Code, Codex, other agent CLIs) behind the
  `HarnessAdapter` seam.
- Public GitHub repository import with sandboxed cloning.
- Accounts and cross-device progress sync.
- Python, Go, Rust, and Java analyzers.
- Multi-language narration and translation.
- Human review UI for generated tours.
- Embeddable tour player for documentation sites.

## Working style

- Release work is sequential; security and packaging are not parallel after the
  freeze.
- Use `tdd` for migrations, CLI, and security boundaries.
- Use the `opencode` skill for plugin packaging questions; use `tdd` and
  `codebase-design` for the release seams.
- Verify with fresh output; do not claim success from earlier runs.
- Commit each wave; tag the release only after the full gate passes.
