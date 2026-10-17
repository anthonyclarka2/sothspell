# Sóþspell — Next-Stage Roadmap (v2)

**Status: planned.** Planning baseline: 2026-10-17.

The v1 local-first release is complete and its plans are archived in
[`plans/archive/`](archive/README.md). This roadmap starts a new stage: from a
single-user local player to a multi-harness, multi-language, collaborative
platform with importable repositories, reviewable tours, and embeddable
players.

This file was started empty for the next stage; the features below were added in
the 2026-10-17 planning session and are sequenced as Phases 9–16.

## Owner decisions (2026-10-17)

1. This stage is planned first; implementation starts with Phase 9.
2. Accounts use **GitHub OAuth**, pairing naturally with repository import.
3. Public GitHub import uses a **local shallow clone** under `SOTHSPELL_HOME`,
   analyzed read-only. No project code runs.
4. Harness plugins ship **Claude Code first, then Codex**, then the remaining
   agent CLIs.
5. The v1 constraints stay binding: pnpm only, TypeScript 7, read-only source,
   local-first defaults, the versioned Sóþspell format, and accessibility as a
   release gate.

## Feature inventory

| #   | Feature                                                              | Phase    |
| --- | -------------------------------------------------------------------- | -------- |
| 1   | Preferences UI for authoring and narration connections               | Phase 9  |
| 2   | Harness plugins (Claude Code, Codex, others) behind `HarnessAdapter` | Phase 10 |
| 3   | Public GitHub import with sandboxed cloning                          | Phase 11 |
| 4   | Accounts and cross-device progress sync                              | Phase 12 |
| 5   | Python, Go, Rust, and Java analyzers                                 | Phase 13 |
| 6   | Multi-language narration and translation                             | Phase 14 |
| 7   | Human review UI for generated tours                                  | Phase 15 |
| 8   | Embeddable tour player for documentation sites                       | Phase 16 |

## Phase sequence

```
Phase 9  Preferences UI
   │
   ├──► Phase 10  Harness plugins (Claude Code, then Codex)
   │        │
   │        └──► Phase 14  Multi-language narration and translation
   │
   ├──► Phase 11  GitHub import (local shallow clone)
   │        │
   │        └──► Phase 13  Python, Go, Rust, Java analyzers
   │
   ├──► Phase 12  Accounts and cross-device sync
   │
   └──► Phase 15  Human review UI
            │
            └──► Phase 16  Embeddable player
```

Phase 9 is the shared foundation for provider configuration. Phases 10–12 and
15 can overlap after Phase 9. Phase 13 is independent of accounts and can start
after Phase 11 or in parallel with a local fixture. Phase 14 depends on Phase 9
(voice profiles) and Phase 10 (harness surfaces). Phase 16 depends on the player
and the tour format, not on accounts.

## Status

| Phase | Status                   | Primary outcome                                                   |
| ----- | ------------------------ | ----------------------------------------------------------------- |
| 9     | in progress (2026-10-17) | Connection profiles, settings API, `/settings` UI, provider tests |
| 10    | complete (2026-10-17)    | `HarnessAdapter` contract, Claude Code plugin, Codex plugin       |
| 11    | complete (2026-10-17)    | GitHub URL import, shallow clone sandbox, import UI               |
| 12    | complete (2026-10-17)    | GitHub OAuth accounts, run sync, account export/delete            |
| 13    | in progress (2026-10-17) | Python/Go/Rust/Java analyzer adapters and fixtures                |
| 14    | in progress (2026-10-17) | Locale-aware tours, translation pipeline, per-locale narration    |
| 15    | in progress (2026-10-17) | Review queue, beat comments, edit/regenerate, approval            |
| 16    | in progress (2026-10-17) | Standalone embed bundle, export command, docs integration         |

## 1. Product direction

v1 proved the core loop: analyze a local project, author an evidence-anchored
tour, play it with code, diagrams, and narration, ask questions, and keep
progress. The next stage removes the four constraints that limit adoption:

- **Configuration**: providers and voices are environment-only today; they need
  a first-class preferences surface.
- **Harness reach**: only OpenCode is supported; other agent CLIs need the same
  story.
- **Source reach**: only local paths work; public GitHub repositories need a
  safe import path.
- **Collaboration**: progress is single-device and anonymous; accounts and sync
  make the tool usable across machines.
- **Language reach**: the analyzer and UI are TypeScript/English-first; more
  languages and locales open the tool to more projects and people.
- **Trust**: generated tours cannot be reviewed or approved today; a review UI
  turns generation into a publishable artifact.
- **Distribution**: tours cannot live in documentation sites; an embed bundle
  makes a tour part of a project's docs.

## 2. New domain concepts

These are added to [`CONTEXT.md`](../CONTEXT.md) as the phases land.

- **Connection profile** — a named, user-owned configuration for one provider
  connection: authoring model, narration voice, or another capability. It has a
  provider, base URL, model/voice id, and a secret reference.
- **Secret reference** — an opaque pointer to a stored credential. The value
  never appears in an API response, a log, or a tour.
- **Harness adapter** — the existing term, now with a concrete contract that
  Claude Code, Codex, and future hosts implement.
- **Imported project** — a project cloned from a public Git URL into
  `SOTHSPELL_HOME`, marked read-only and analyzed like a local checkout.
- **Workspace account** — a GitHub-backed identity that owns runs, reviews, and
  preferences across devices.
- **Review session** — a human review of a generated tour: comments, edits,
  approvals, and the decision record.
- **Locale** — the language of a tour's narration, UI copy, and narration
  voice; anchors and code stay language-independent.
- **Embed bundle** — a self-contained player build plus tour data that a
  documentation site can serve without the Sóþspell server.

## 3. Architecture changes

The v1 module boundaries stay. The next stage adds adapters rather than
rewriting:

```
packages/core        + locale metadata, translation-aware narration schema
packages/settings    + connection profiles, secret store, settings service
packages/analyzer    + LanguageAnalyzer port; ts/js, python, go, rust, java adapters
packages/authoring   + translation pass, review annotations, profile-aware models
packages/narration   + per-locale voices, translation-aware segments
packages/player      + embed entry point and host bridge
packages/embed       + standalone player bundle and host API
packages/harness     + HarnessAdapter contract and shared host runtime
packages/import      + public Git import, shallow clone, sandbox policy
packages/accounts    + GitHub OAuth, user/session model, sync merge rules
apps/api             + settings, import, auth, sync, review, export routes
apps/web             + /settings, /import, /review, /account, locale switcher
apps/cli             + import, export, sync, review commands
```

## 4. Cross-cutting requirements (every phase)

- **Read-only source.** Imported or local, source is read-only. No project code
  runs, no package scripts run, no installs inside the project.
- **Sandbox discipline.** Imported clones live under `SOTHSPELL_HOME`; path
  containment, symlink checks, size limits, and no submodules/LFS by default.
- **Secret handling.** Provider keys are stored server-side, referenced by id,
  never returned to the browser, never logged, never embedded in tours.
- **Accessibility.** Every new UI surface passes the axe gate at 0 critical /
  0 serious and has a keyboard-only path.
- **Local-first continuity.** Every account/cloud feature has a local fallback.
  The tool remains usable with no account and no provider key.
- **Format stability.** Tour schema changes are versioned with migrations;
  anchors stay valid or visibly stale.
- **TypeScript 7 / pnpm.** No classic compiler API; pnpm only.
- **Bunbun read-only.** No command writes into
  `/Users/ajc/Projects/codegens/bunbun`.
- **Docs and plans stay current.** Update the phase plan, roadmap, `AGENTS.md`,
  and `CONTEXT.md` when behavior or decisions change.

## 5. Testing standards

- TDD for every public seam; confirm seams before the first test.
- Unit tests with fake providers, fake OAuth, fake Git remotes, and fixtures.
- Integration tests through the Hono API and the analyzer seam.
- Browser tests for settings, import, review, account, and embed journeys.
- Accessibility gate on every new page and state.
- Security tests for secret handling, OAuth session security, import path
  containment, clone size limits, and review permissions.
- A Bunbun acceptance test in every phase that touches the analyzer, authoring,
  player, or plugin, proving the Bunbun tree stays unchanged.

## 6. Bunbun example

Bunbun remains the reference project:

- Phase 9 configures authoring and narration profiles and authors a Bunbun tour
  through the selected profile.
- Phase 10 opens the Bunbun tour from Claude Code and Codex.
- Phase 11 imports a public fixture repository; Bunbun is not cloned remotely
  (it stays the local read-only checkout).
- Phase 12 syncs a Bunbun run across two local browser profiles.
- Phase 13 analyzes small Python/Go/Rust/Java fixtures; Bunbun remains the
  TypeScript acceptance project.
- Phase 14 translates the Bunbun tour into a second locale and narrates it.
- Phase 15 reviews the fixture-generated Bunbun tour and approves it.
- Phase 16 embeds the golden Bunbun tour in a docs fixture.

## 7. Risks and open questions

1. **OAuth app ownership.** GitHub OAuth needs a registered app and redirect
   URLs for local and hosted use. Local development can use a device flow or a
   loopback redirect; the decision lands in Phase 12.
2. **Sync conflicts.** Two devices can edit the same run offline. Phase 12 uses
   per-field last-write-wins with a union of completed beats; richer CRDTs are
   out of scope.
3. **Imported repository trust.** A public clone can contain symlinks, huge
   files, or prompt-injection text. The import sandbox and analyzer redaction
   are the first line; the model context remains bounded.
4. **Language parser quality.** Python/Go/Rust/Java symbol graphs will be less
   precise than TypeScript. Anchors still verify by content hash, so the worst
   case is a dropped symbol, not a false claim.
5. **Translation fidelity.** Code identifiers and citations must not be
   translated. The pipeline translates narration and labels only and keeps
   anchors untouched.
6. **Review scope.** A review UI can grow into a full CMS. Phase 15 is a
   beat-level review and approval workflow, not a document editor.
7. **Embed security.** An embed bundle contains excerpts and narration, not the
   whole repository. Export must state exactly what ships.
8. **Harness API churn.** Claude Code and Codex plugin APIs move quickly; the
   harness contract isolates the churn to adapters.

## 8. Success metrics

- A new user can configure a model and voice entirely in the UI, with no env
  edits.
- Claude Code and Codex can each generate and open a tour for a local project.
- A public GitHub repository can be imported, analyzed, and toured without a
  manual clone.
- A signed-in user sees the same run on two devices after a sync.
- Python, Go, Rust, and Java fixtures produce valid snapshots, symbols, and
  anchors.
- A tour can be translated and narrated in a second locale with anchors
  unchanged.
- A reviewer can comment, edit, regenerate, and approve a tour, with the
  decision recorded.
- A docs site can embed a tour with no Sóþspell server running.
- Every phase keeps the axe gate at 0 critical / 0 serious and the Bunbun tree
  unchanged.

## 9. Phase plans

- [Phase 9 — Preferences UI](PHASE-9.md)
- [Phase 10 — Harness Plugins](PHASE-10.md)
- [Phase 11 — GitHub Import](PHASE-11.md)
- [Phase 12 — Accounts & Sync](PHASE-12.md)
- [Phase 13 — Language Analyzers](PHASE-13.md)
- [Phase 14 — Multi-language Narration & Translation](PHASE-14.md)
- [Phase 15 — Human Review UI](PHASE-15.md)
- [Phase 16 — Embeddable Player](PHASE-16.md)
