# Sóþspell

**Sóþspell** (Old English for "truth story") is an AI/LLM-guided walkthrough of a
software project. It explains a codebase from the top down like a film: a
narrator describes the system, diagrams build and change with the story, and the
relevant code is highlighted and linked as each module, class, function, object,
or feature is discussed.

The explanation can play continuously when the user has nothing to ask. The user
can pause at any moment, open the code, click a diagram node, or ask a question;
answering does not lose their place. Progress is recorded so the walkthrough can
resume later.

<img width="1611" height="1008" alt="Screenshot 2026-10-20 at 13 21 12" src="https://github.com/user-attachments/assets/158512de-98c1-4242-b06b-a21d1bb23ce5" />

## Contributors

I welcome PRs and issues! I request that a human reads the whole bug report
or pull request before it is submitted. I also would much prefer smaller PRs
rather than huge ones. Please create PRs that merge into the `dev` branch, not main.

If you are able to tip me for this work, I'd be eternally grateful. I'm currently
looking for work.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/A0A21MC3JK)

## Quick start

Prerequisites: If you want to use voice support other than browser-based speech,
you will need an ElevenLabs API key. If you want to create your own narrations,
or ask questions during an existing tour, you will need an LLM API key.

### Web

```bash
<in a suitable parent directory>
git clone https://github.com/anthonyclarka2/sothspell.git
cd sothspell
pnpm install
pnpm build
pnpm sothspell help
pnpm sothspell serve
```

http://127.0.0.1:4319/ is opened automatically. From here you can run through the demo narration.

#### To Analyse and Narrate a Different Repo

1. Run the web interface as above. (`pnpm sothspell serve`)
2. Open settings near the top right corner of the browser window.
3. Click "New authoring profile" and add an LLM API key. Test the connection and save it.
4. If you have an ElevenLabs API key, you can do the same for "New narration profile".
5. Then click "New Tour".
6. You can choose either a local git repo, or a remote GitHub repo (other Git hosts coming soon!).
7. Check that the repository is accessible via "Check repository".
8. Choose "Active authoring profile".
9. Choose the level of narration: New contributor, Technical evaluator, or Maintainer.
10. Choose a target runtime (TODO: suggest runtime length based on repo size + level of narration)
11. Click "Author the tour" and wait a few minutes.
12. Follow the tour in your web browser!

When in the tour of the repository, you can listen to a narrator or read along at your own pace. To listen to a narrator, choose one of "Browser voice" or "Cloud voice". Browser voice uses the built in web speech API, while Cloud voice uses the credentials and voice you chose earlier in the Narration Profile setup.

Enjoy the tour!

### Terminal

Analyze a local repository read-only and author a tour (use your own checkout
path; Bunbun is this project's reference project):

```bash
pnpm sothspell analyze /path/to/your/repo --brief
pnpm sothspell analyze /path/to/your/repo --save
pnpm sothspell author /path/to/your/repo --model fixture --out /tmp/your-tour
SOTHSPELL_MODEL=openai/gpt-5.2 pnpm sothspell author /path/to/your/repo --out /tmp/your-tour
```

### OpenCode Plugin

Not published yet; OpenCode V2 can load a local plugin directory, so the plugin
runs straight from this checkout.

Prerequisites (once per checkout):

```bash
cd /path/to/sothspell
pnpm install
pnpm build            # gives `sothspell serve` a web player to host
pnpm sothspell serve  # terminal 1; player and API on http://127.0.0.1:4319
```

Point OpenCode at the plugin directory in the project you want to tour, in
`opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/absolute/path/to/sothspell/packages/opencode-plugin",
      "options": { "playerUrl": "http://127.0.0.1:4319" },
    },
  ],
}
```

Relative paths resolve from the config file that contains the entry, so an
absolute path is the least surprising when the plugin lives in another
checkout. Restart OpenCode if it was already running
(`opencode service restart`).

Then, in a session:

- `/sothspell` — open the existing tour, or generate one first.
- `/sothspell status`, `/sothspell generate`, `/sothspell ask <question>`.
- Tools: `sothspell_status`, `sothspell_open`, `sothspell_generate`,
  `sothspell_ask`.
- Options: `playerUrl` (4319 for `sothspell serve`, 5173 for `pnpm dev`),
  `autoOpen`, `model`, `maxMinutes`.

The plugin resolves `@opencode/plugin` and the `@sothspell/*` workspace
packages from this checkout's `node_modules`, which is why `pnpm install` runs
here first. The terminal only launches the browser; diagrams, code, and
narration play in the player. See
[docs/opencode-plugin.md](docs/opencode-plugin.md) for the full surface.

### Claude Code Plugin

Not published yet; Claude Code loads a plugin directory directly, so no
marketplace or registry is needed.

With the same prerequisites (checkout installed, `pnpm sothspell serve`
running):

```bash
claude --plugin-dir /absolute/path/to/sothspell/packages/harness-claude-code/plugin
```

The plugin ships a `sothspell` skill with four verbs — `/sothspell`,
`/sothspell status`, `/sothspell generate`, `/sothspell ask <question>` — and a
SessionStart hook that announces an existing tour. Its `userConfig` exposes
`player_url` (default `http://127.0.0.1:4319`) and an optional `model`.

The bundled wrapper runs `pnpm --dir <repo> exec tsx` against this checkout. If
you copy the plugin elsewhere, set `SOTHSPELL_REPO=/path/to/sothspell` (or
`SOTHSPELL_TSX` to a tsx-compatible launcher). See
[docs/harnesses.md](docs/harnesses.md).

### Codex Plugin

Not published yet; Codex installs plugins from a local marketplace entry, so no
registry is needed.

With the same prerequisites, add the plugin to a marketplace file — personal
(`~/.agents/plugins/marketplace.json`) or repo
(`.agents/plugins/marketplace.json`):

```jsonc
{
  "name": "local-sothspell",
  "plugins": [
    {
      "name": "sothspell",
      "source": {
        "source": "local",
        "path": "/absolute/path/to/sothspell/packages/harness-codex/plugin",
      },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity",
    },
  ],
}
```

Restart Codex, install the plugin, and review and trust its bundled hook in
`/hooks`. Then invoke the skill — `$sothspell` (or `/skills`) — with `status`,
`generate`, `open`, and `ask <question>`.

The bundled wrapper runs `pnpm --dir <repo> exec tsx` against this checkout. If
you copy the plugin elsewhere, set `SOTHSPELL_REPO=/path/to/sothspell` (or
`SOTHSPELL_TSX`). `SOTHSPELL_PLAYER_URL` overrides the default player URL
`http://127.0.0.1:4319`. See [docs/harnesses.md](docs/harnesses.md).

## Example project

The first reference project is **Bunbun**, a NestJS + Prisma Next + ATProto
discussion service at commit `9fef24d`. The Bunbun tree is read-only; all
snapshots, tours, audio, and runs live under `SOTHSPELL_HOME` (default
`~/.sothspell`). The checked-in golden tour lives in `examples/bunbun-tour/` and
stores only small, attributed excerpts.

## Documentation

- [Canvas roadmap](plans/ROADMAP.md) — the completed canvas era: scene, code
  relationships, accessibility, export, performance, and risks.
- [Phase 17](plans/PHASE-17.md) — canvas foundation, evidence links, multiple
  diagrams, controls, and fullscreen.
- [Phase 18](plans/PHASE-18.md) — symbol targets, call/reference index,
  incoming/outgoing containers, definition links, and the shared-symbol bridge.
- [Phase 19](plans/PHASE-19.md) — keyboard model, screen-reader outline,
  preferences, contrast, large text, and compact layout.
- [Phase 20](plans/PHASE-20.md) — PNG/JPG/PDF export, performance budget,
  coverage, docs, and the final gate.
- [Canvas feature brief](plans/CANVAS-FEATURES.md) — the original deliverables
  and constraints.
- [Archived plans](plans/archive/README.md) — the completed v1 and v2 eras, with
  their shipped baselines and binding constraints.
- [Archived v1 plans](plans/archive/v1/README.md) — the first-release roadmap
  and Phases 1–8.
- [Archived v2 roadmap](plans/archive/v2/ROADMAP.md) — the completed next-stage
  feature inventory, phase sequence, architecture changes, security, testing
  standards, and risks.
- [Architecture](docs/architecture.md) — packages, pipeline, trust boundaries,
  and storage.
- [Tour format](docs/tour-format.md) — the document, anchors, diagrams, and
  versioning.
- [Phase 9](plans/archive/v2/PHASE-9.md) — preferences UI for authoring and
  narration connections.
- [Phase 10](plans/archive/v2/PHASE-10.md) — Claude Code and Codex harness
  plugins.
- [Phase 11](plans/archive/v2/PHASE-11.md) — public GitHub import with sandboxed
  cloning.
- [Phase 12](plans/archive/v2/PHASE-12.md) — GitHub OAuth accounts and
  cross-device sync.
- [Phase 13](plans/archive/v2/PHASE-13.md) — Python, Go, Rust, and Java
  analyzers.
- [Phase 14](plans/archive/v2/PHASE-14.md) — multi-language narration and
  translation.
- [Phase 15](plans/archive/v2/PHASE-15.md) — human review UI for generated tours.
- [Phase 16](plans/archive/v2/PHASE-16.md) — embeddable player for documentation
  sites.
- [Development guide](docs/development.md) — workspace, commands, and the
  golden-tour workflow.
- [Repository analysis](docs/analysis.md) — read-only snapshots, symbols, cache,
  CLI, and project brief.
- [Tour authoring](docs/authoring.md) — model port, context packs, curriculum,
  validation, repair, quality reports, and the author CLI.
- [Player and code browser](docs/player.md) — playback controls, keyboard map,
  virtualized code pages, stale badges, and progress.
- [Canvas playback](docs/canvas.md) — the opt-in spatial board, evidence and
  relation links, keyboard/preferences, export, and performance.
- [Narration](docs/narration.md) — browser and cloud speech, synchronization,
  caching, and privacy.
- [Guide and interludes](docs/guide.md) — in-tour questions, citations,
  drilldown, and progress.
- [OpenCode plugin](docs/opencode-plugin.md) — install, commands, tools, RPC,
  and the host model adapter.
- [Harnesses](docs/harnesses.md) — the adapter contract and the Claude Code and
  Codex adapters.
- [Settings and connection profiles](docs/settings.md) — provider profiles, the
  secret store, and resolution rules.
- [GitHub import](docs/import.md) — URL forms, sandbox limits, and the import
  API/UI/CLI.
- [Accounts and sync](docs/accounts.md) — GitHub OAuth, sessions, sync merge
  rules, export, and delete.
- [Embeddable player](docs/embed.md) — export, the host API, progress, CSP, and
  the docs fixture.
- [Human review](docs/review.md) — the review state machine, editing,
  regeneration, anchor gating, and decisions.
- [Translation and locales](docs/translation.md) — the locale schema,
  protected-span pipeline, localized UI, and RTL support.
- [Open a repository](docs/open-repo.md) — author a tour from a local git
  checkout or a public GitHub URL in the web UI.
- [Tiny notes example](examples/tiny-notes/README.md) — the small demo
  repository for the open-repository flow.
- [Self-hosting](docs/self-hosting.md) — install, serve, storage, and upgrades.
- [Privacy](docs/privacy.md) — what stays local and what cloud choices send.
- [Accessibility](docs/accessibility.md) — the axe gate and keyboard map.
- [Troubleshooting](docs/troubleshooting.md) — common local failures.
- [Release notes](docs/release-notes.md) — the first release and limitations.
- [Security policy](SECURITY.md) — reporting, posture, accepted risks, and the
  operator checklist.
- [Authoring skill](skills/sothspell-author/SKILL.md) — the checklist an agent
  uses to author or review a tour.
- [Domain context](CONTEXT.md) — the project glossary.
- [Agent instructions](AGENTS.md) — how agents work in this repository.

## Development

### Running the dev instance

```bash
pnpm install
pnpm dev            # API on 127.0.0.1:4319, web on 127.0.0.1:5173
```

Open <http://127.0.0.1:5173> and play the demo tour.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:browser
pnpm test:a11y
pnpm build
pnpm check:toolchain
pnpm check:secrets
pnpm schema:json
pnpm tour:build      # regenerate the golden tour from the pinned Bunbun checkout
```

### Stack

pnpm 12.14.0 · Node.js 26 · TypeScript 7.0.2 · React 19.3.1 · Vite 8.3.4 ·
TanStack Router 1.170.45 · Hono 4.13.13 · Zod 4.6.7 · Shiki 4.5.0 ·
React Flow 12.12.0 · ELK 0.12.0 · oxc-parser 0.154.0 · fast-glob 3.3.3 ·
ignore 7.0.12 · yaml 2.9.1 · Vercel AI SDK 7.0.143 · Vitest 5.0.5 ·
Playwright 1.64.1 · axe-core 4.14.0.

TypeScript 7.0 has no programmatic compiler API; the analyzer will use
`oxc-parser`, not the TypeScript compiler API. See the roadmap for the full
version table and constraints.

## Similar work

DeepWiki, CodeSee tours/maps, Swimm, VS Code CodeTour, GitDiagram, Scrimba, and
NotebookLM Audio Overviews each solve part of the problem. Sóþspell combines
evidence-anchored code, animated diagrams, narration, semi-interactive Q&A,
resumable progress, and harness-native plugins. The roadmap has the comparison
and sources.

## License

MIT

## Status

**v1 release complete (2026-10-17); next stage complete (2026-10-17).**
The repository contains:

- a pnpm workspace on TypeScript 7.0.2, React 19, Vite 8, and Hono 4;
- the versioned Sóþspell schema, a generated JSON Schema, and a compiler that
  resolves anchors, hashes excerpts, highlights code with Shiki, and lays out
  diagrams with ELK;
- a checked-in golden Bunbun tour pinned to commit `9fef24d`;
- a read-only repository analyzer with `oxc-parser`: deterministic snapshots,
  symbol extraction, import/reference graphs, NestJS/Prisma signals, a project
  brief, a per-file cache, and the `sothspell analyze` CLI;
- an LLM authoring pipeline: `GuideModel` port, AI SDK adapters, a deterministic
  fixture model, context packs, curriculum planning, chapter/diagram generation,
  validation, bounded repair, caching, quality reports, and the
  `sothspell author` CLI;
- the cinematic player: auto-advance, pause/resume, scrubber, speed, theater
  mode, completed-beat tracking, keyboard control, a virtualized full-file code
  browser with stale badges and anchor outlines, and local-first run progress
  mirrored to a local SQLite table;
- narration: browser speech and opt-in ElevenLabs cloud narration with aligned
  timings, content-addressed audio, range serving, and fallback;
- in-tour questions with cited answers, drilldown generation, and a
  `sothspell serve`/`doctor` local runtime;
- the OpenCode V2 plugin with commands, tools, typed RPC, a host model adapter,
  generated-tour serving, and an embedded-host smoke test;
- unit, browser, accessibility, and plugin tests, including the Bunbun
  acceptance pass.

The v1 and v2 plans are archived in
[`plans/archive/`](plans/archive/README.md). The next stage completed in
[`plans/archive/v2/ROADMAP.md`](plans/archive/v2/ROADMAP.md): preferences
UI, Claude Code and Codex harness plugins, GitHub import, accounts and sync,
Python/Go/Rust/Java analyzers, multi-language narration and translation, the
human review UI, and the embeddable player. A reviewed real-model Bunbun tour
and live cloud narration remain owner-gated on provider credentials; fixture and
browser paths are verified.

The canvas era is complete in [`plans/ROADMAP.md`](plans/ROADMAP.md) as Phases
17–20. The canvas is opt-in; manual VoiceOver/NVDA, real Save-as-PDF, and
real-device touch checks remain owner-gated.
