# Sóþspell — Development Roadmap

**Status: planned.** Planning baseline: 2026-10-17.

Sóþspell (Old English for "truth story"; ASCII slug `sothspell`) is an AI-guided
walkthrough of a software project. It turns a repository into a cinematic,
semi-interactive explanation: a narrator explains the system from the top down,
diagrams build and change with the story, and the relevant code is highlighted
and linked as each module, class, function, object, or feature is discussed.

The first product is a self-hosted website. The same tour artifact then runs
inside an OpenCode V2 plugin, and later inside other LLM harnesses.

This document is the hub plan. Phase-level plans live beside it:

- [Phase 1 — Foundation & Sóþspell Format](PHASE-1.md)
- [Phase 2 — Repository Intelligence](PHASE-2.md)
- [Phase 3 — LLM Authoring Pipeline](PHASE-3.md)
- [Phase 4 — Cinematic Player & Code Browser](PHASE-4.md)
- [Phase 5 — Narration & Accessibility](PHASE-5.md)
- [Phase 6 — Semi-Interactive Guide & Progress Sync](PHASE-6.md)
- [Phase 7 — OpenCode V2 Plugin](PHASE-7.md)
- [Phase 8 — Self-Hosted Release & Hardening](PHASE-8.md)

Domain vocabulary lives in [`CONTEXT.md`](../CONTEXT.md). Agent instructions
live in [`AGENTS.md`](../AGENTS.md).

Status convention: `**Status: planned**` → `**Status: in progress**` →
`**Status: complete (<date>)**`, with shipped evidence recorded under the phase.

### Owner decisions (2026-10-17 planning session)

1. This session delivers plans and documentation only; application scaffolding
   starts with Phase 1.
2. The first website is local-first and self-hosted. Public GitHub import is a
   future track.
3. The web stack is React 19 + Vite 8 + Hono 4 on Node, with SQLite local
   storage. Next.js was considered and rejected for the first release.
4. TypeScript 7 and pnpm are mandatory. The TypeScript 7 compiler-API gap is an
   architectural constraint.
5. Both narration adapters ship at launch: browser speech and cached cloud
   narration. ElevenLabs is the default cloud adapter because it returns
   character timings.
6. Progress is anonymous and local-first; no account is required in the first
   release.
7. The first harness plugin targets OpenCode V2 (`@opencode/plugin` 2.0.32).
8. The visual direction is a clean modern devtool, not an antique or parchment
   treatment.
9. The Bunbun demo is a checked-in golden tour pinned to commit `9fef24d`, with
   small attributed excerpts. The Bunbun tree remains read-only.

## 1. The problem

A codebase is not self-explanatory. A new contributor can read the README, open
the files, and still miss the shape of the system: which modules own which
decisions, how a request travels, why a store exists beside the source of truth,
and where the seams are. Existing tools help with pieces of this:

- repository wikis summarize files but do not tell a paced story;
- code tours step through files but do not synchronize diagrams and narration;
- codebase maps show structure but do not explain it or track a learner's path;
- AI chat answers questions but does not provide a continuous, resumable
  walkthrough when the user has nothing to ask.

Sóþspell joins those pieces into one artifact: a **truth story** that can play
like a movie, stop when the user wants to ask something, and resume exactly
where it left off. Every code claim is anchored to a real file and symbol in a
pinned snapshot.

## 2. Product principles

1. **Truth before fluency.** The narrator may only make claims the snapshot
   supports. Code references are resolved and hashed; unsupported claims are
   dropped or marked uncertain.
2. **Cinema with an exit.** The default experience auto-advances. At any moment
   the user can pause, seek, open code, click a diagram node, ask a question, or
   leave and resume later.
3. **Top-down, then deep.** Start with purpose and system shape, then drill into
   modules, classes, functions, objects, and features. The user chooses the
   depth; the tour supplies a good default path.
4. **Local-first and read-only.** The first release runs on the user's machine,
   analyzes a local repository, and never writes to it. Source stays local except
   for the excerpts explicitly sent to the configured model or TTS provider.
5. **Text is always enough.** Narration is an enhancement, not a dependency.
   Every beat is readable, every diagram has a text alternative, and every
   control works by keyboard.
6. **One artifact, many harnesses.** Authoring produces a portable, versioned
   tour document. The web player and the OpenCode plugin consume the same
   artifact; they do not fork the explanation.
7. **Evidence over decoration.** Diagrams are structured instructions that
   compile deterministically. The model does not emit HTML, JavaScript, or
   arbitrary SVG.

## 3. Similar work and the gap

Research checked 2026-10-17. These are the closest products or formats, and why
Sóþspell is not a copy of any one of them.

| Product / format                                                                                                                            | What it does                                                                                                                                                                                              | What Sóþspell adds                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [DeepWiki](https://deepwiki.com/) / [Devin's repository wikis](https://docs.devin.ai/work-with-devin/deepwiki)                              | Generates wiki-style docs, architecture diagrams, code links, and conversational Q&A for repositories.                                                                                                    | A paced, auto-advancing tour with synchronized code focus and diagrams, persistent progress, and a shared harness plugin. |
| [CodeSee](https://docs.codesee.io/docs/getting-started) tours and maps                                                                      | Interactive codebase maps and step-by-step onboarding tours; AI summaries and PR tours. CodeSee's standalone maps/tours are no longer marketed, and GitKraken Codemaps is in development as of late 2026. | An AI-authored narrative that runs without an IDE, with narration, diagrams, and resumable progress.                      |
| [Swimm](https://swimm.io/)                                                                                                                  | Code-coupled documentation with anchored snippets and IDE integration.                                                                                                                                    | A generated movie-like explanation rather than docs a team must author and maintain by hand.                              |
| [VS Code CodeTour](https://marketplace.visualstudio.com/items?itemName=vsls-contrib.codetour) and [LACY](https://arxiv.org/html/2603.25391) | Step-based tours anchored to files and lines, optionally AI-generated or expert-curated.                                                                                                                  | Diagrams, speech, continuous playback, Q&A, progress, and use outside VS Code.                                            |
| [GitDiagram](https://github.com/ahmedkhaleel2004/gitdiagram)                                                                                | One-shot Mermaid architecture diagrams from a repository tree.                                                                                                                                            | A sequence of diagrams tied to a narrative, with node-to-code links and animated focus.                                   |
| [Scrimba](https://scrimba.com/)                                                                                                             | Interactive screencasts where the learner can pause and edit the instructor's code.                                                                                                                       | Explains an existing project rather than teaching a new build; read-only, no code execution.                              |
| [NotebookLM Audio Overviews](https://blog.google/innovation-and-ai/products/notebooklm-audio-overviews/)                                    | Narrated overviews with interactive questions that return to the original audio.                                                                                                                          | Code-aware narration with line-level anchors and diagrams; local repository as the source.                                |

The gap is the combination: **evidence-anchored code + animated diagrams +
narration + semi-interactive Q&A + resumable progress + harness-native plugins.**
Each part exists somewhere; the synchronized, truth-checked walkthrough does not.

## 4. Users and jobs

**Primary user: the new contributor.** They need to understand a repository
quickly without reading every file. They want a guided path, the ability to stop
and ask "why?", and a way to return later.

**Secondary user: the technical evaluator.** They want a fast, credible tour of
an unfamiliar project before deciding whether to adopt, review, or contribute.

**Third user: the maintainer.** They want to generate a walkthrough for their
own project, review it, and share it or run it inside their agent harness.

**Explicit non-users for the first release:** teams needing multi-tenant
accounts, permissions, and hosted private-repository analysis. Local-first is
the initial trust model.

## 5. Experience specification

### 5.1 First run

1. The user starts the local server (`pnpm sothspell` or `sothspell serve`).
2. The home page asks for a local project path. The path must be under a
   configured allowlist; the server explains that the project is opened
   read-only.
3. The app analyzes the repository and shows a project brief: name, revision,
   top-level modules, languages, and a proposed tour outline.
4. The user chooses **Generate tour**. The authoring pipeline produces a draft,
   validates it, and opens the player.
5. If a checked-in golden tour exists for the snapshot, the user may open it
   immediately without a model call.

### 5.2 Tour shape

A tour is a hierarchy:

```
Tour
└── Chapter ("From request to page")
    ├── Diagram(s)
    └── Beat ("The page loader resolves one request")
        ├── Narration (text, optionally audio)
        ├── Code focus (1–3 anchors)
        └── Diagram focus (nodes/edges to highlight)
```

A **beat** is the atomic unit of playback: one idea, one narration passage, one
stage state, and a duration. A **chapter** is a narrative unit with a shared
diagram or a small set of diagrams. A **tour** is the whole truth story.

### 5.3 Playback modes

- **Read**: text and diagrams, auto-advancing at a reading-speed estimate. No
  audio required.
- **Listen**: speech, synchronized text, and diagrams. Audio is generated by the
  browser adapter or a cached cloud voice.
- **Explore**: paused. The user scrubs, opens code, clicks diagram nodes, and
  asks questions. Resuming returns to the exact beat and offset.

Pause/resume, previous/next beat, chapter jump, speed control, captions, and a
progress scrubber are available in every mode. Explicit interactions pause the
movie; a single **Resume** returns to the point where the user left.

### 5.4 Semi-interactive behavior

If the user does nothing, the tour auto-advances through beats and chapters.
If the user asks a question:

1. Playback pauses at the current offset.
2. The guide answers using the current beat, the tour outline, and relevant code
   excerpts.
3. The answer cites code anchors and may suggest a deeper beat.
4. **Continue** resumes the movie at the saved offset; the answer is kept in the
   run history.

The user can also click a diagram node or a code link. The player opens the code
page in a side pane or a new page without losing the run position. A code page
always links back to the beat that sent the user there.

### 5.5 Routes

| Route                         | Purpose                                                   |
| ----------------------------- | --------------------------------------------------------- |
| `/`                           | Home, project picker, recent tours                        |
| `/p/:projectId`               | Project brief, snapshot, tour list, generation status     |
| `/p/:projectId/source/*`      | Read-only code page with anchor focus and line links      |
| `/t/:tourId`                  | Player, resumes the latest run or starts at the beginning |
| `/t/:tourId/:beatId`          | Deep link to a beat                                       |
| `/t/:tourId/:beatId/source/*` | Player with the code pane open at an anchor               |
| `/runs`                       | Local progress, export/import, delete                     |
| `/settings`                   | Model provider, voice provider, storage, privacy          |

Code URLs carry the anchor and beat, for example:

```
/p/bunbun/source/apps/api/src/comments/comments.service.ts?anchor=anchor_comments_create&beat=beat_comment_write
```

The anchor resolves to a symbol or a line range; the code page highlights that
range and shows the beat's annotation.

### 5.6 Progress

A **run** records the tour version, current beat, per-beat offset, completed
beats, playback mode, speed, question history, and timestamps. Progress is
written to IndexedDB immediately and to the local SQLite store through a signed
anonymous session. A run can be exported and imported as JSON. No account is
required in the first release.

The player offers **Resume** and **Start over** when a run exists. A completed
tour offers a summary, a chapter index, and a **Replay chapter** action.

### 5.7 Visual direction

Clean modern devtool, not a period pastiche. The old-English name is carried by
the wordmark and the editorial rhythm, not by parchment textures.

- Off-white and ink surfaces, cool neutral grays, one cobalt accent.
- Geist Sans for prose and UI; Geist Mono for code, line numbers, and metadata.
- Code and diagrams share the stage; the narration rail stays readable.
- Subtle transitions between beats and diagram focus changes; no perpetual
  animation, no neon glow, no gradient text.
- Dark mode follows the system by default and uses the same accent.
- Syntax highlighting uses a dual light/dark Shiki theme.

## 6. Domain model

The authoritative glossary is [`CONTEXT.md`](../CONTEXT.md). The core terms:

- **Sóþspell** — a versioned, portable walkthrough artifact.
- **Project snapshot** — an immutable, read-only view of a repository at a
  revision, with files, symbols, and hashes.
- **Chapter** — a narrative unit of a Sóþspell.
- **Beat** — one narrated idea with code and/or diagram focus.
- **Code anchor** — a stable reference to a file, symbol, and line range, with a
  content hash.
- **Diagram instruction** — a structured graph specification that compiles to a
  deterministic layout.
- **Narration** — the text of a beat and, optionally, aligned audio.
- **Interlude** — a question and answer inserted into a run without changing the
  tour.
- **Run** — one user's progress through one tour.
- **Guide** — the LLM-backed narrator and answerer.
- **Harness adapter** — the integration layer for a host such as OpenCode.

## 7. System architecture

### 7.1 Monorepo layout

```
apps/web                  @sothspell/web — React 19 + Vite 8 + TanStack Router
apps/api                  @sothspell/api — Hono 4 on Node; API + static web host
apps/cli                  @sothspell/cli — analyze, author, serve, export
packages/core             @sothspell/core — schema, IDs, compiler, validation
packages/analyzer         @sothspell/analyzer — read-only snapshot + symbol graph
packages/authoring        @sothspell/authoring — GuideModel port, prompts, pipeline
packages/player           @sothspell/player — framework-free playback state machine
packages/narration        @sothspell/narration — TTS adapters, alignment, cache
packages/diagram          @sothspell/diagram — diagram IR, validation, ELK layout
packages/harness          @sothspell/harness — harness adapter contract
packages/opencode-plugin  @sothspell/opencode-plugin — OpenCode V2 plugin
examples/bunbun-tour      golden tour pinned to bunbun commit 9fef24d
docs/                     architecture, authoring, plugin, privacy, self-hosting
plans/                    this roadmap and phase plans
```

The workspace uses pnpm only. Each package exposes a small public interface via
its `exports` map; no cross-package deep imports.

### 7.2 Pipeline

```
local repository (read-only)
        │
        ▼
Project snapshot ──► symbol graph ──► context pack
        │                                  │
        │                                  ▼
        │                           LLM authoring
        │                         (curriculum → beats)
        │                                  │
        │                                  ▼
        └──────────────► compiler ◄── validation + repair
                              │
                              ▼
                     Sóþspell artifact
                     ├── narration text
                     ├── code anchors + excerpts
                     ├── diagram instructions
                     ├── narration audio + alignment
                     └── metadata + hashes
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
            web player                 OpenCode plugin
```

The authoring stage is the only stage that calls a model. The player is
deterministic for a fixed artifact and snapshot, so playback and tests do not
depend on a model.

### 7.3 Runtime topology

- One Node process serves the Hono API and the built web assets.
- The process binds to `127.0.0.1` by default. Remote binding requires an
  explicit setting and a warning.
- SQLite (via `better-sqlite3`) stores metadata and runs. Tour documents, source
  snapshots, audio, and caches live under `SOTHSPELL_HOME`.
- `SOTHSPELL_HOME` defaults to `~/.sothspell`; nothing is written to the target
  repository.
- The OpenCode plugin starts the same local server, opens the browser, and shares
  the same `SOTHSPELL_HOME`.

### 7.4 Storage layout

```
$SOTHSPELL_HOME/
  sothspell.db                 # projects, snapshots, tours, runs, answers
  secret                       # local cookie-signing secret
  projects/<projectId>/
    snapshot.json
    tours/<tourId>.json
    audio/<contentHash>.mp3
    audio/<contentHash>.json   # alignment + provider metadata
  cache/
    analysis/<fileHash>.json
    llm/<promptHash>.json
  logs/
```

No absolute source path is stored in a shareable tour artifact. The server keeps
the project root; the artifact carries the project slug and revision.

### 7.5 Deep modules and seams

The design follows `codebase-design`: small interfaces, large implementations,
testable at the public seam.

| Module          | Public interface                                      | Hides                                                                                       |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `core/compiler` | `compileSothspell(document, snapshot) → CompiledTour` | schema validation, anchor resolution, duration estimation, highlight ranges, diagram layout |
| `analyzer`      | `analyzeProject(root, options) → ProjectSnapshot`     | path safety, ignore rules, parsing, symbol extraction, hashing, caching                     |
| `authoring`     | `authorTour(snapshot, model, options) → TourDraft`    | prompts, context packing, planning, generation, validation, repair, cost accounting         |
| `player`        | `createPlayback(compiled, options) → Playback`        | timing, auto-advance, pause/seek, audio events, progress events                             |
| `narration`     | `synthesize(text, voice) → NarrationSegment`          | provider adapters, alignment normalization, caching                                         |
| `progress`      | `ProgressStore`                                       | local/remote merge, signed anonymous session, export/import                                 |
| `harness`       | `HarnessAdapter`                                      | project root, revision, model call, storage, player launch                                  |
| OpenCode plugin | `Plugin.define(...)` + RPC                            | host lifecycle, model access, storage, browser launch                                       |

## 8. Sóþspell document format

The format is JSON, validated by Zod and exported as JSON Schema for model
prompts. The schema is versioned; a migration function is required for every
breaking change.

```jsonc
{
  "schemaVersion": "1.0.0",
  "id": "tour_bunbun_9fef24d",
  "title": "Bunbun: a truth story",
  "subtitle": "How a comment travels from a browser island to an ATProto record",
  "audience": "new-contributor",
  "project": {
    "slug": "bunbun",
    "name": "Bunbun",
    "revision": { "commit": "9fef24d", "branch": "main", "dirty": false },
  },
  "estimatedDurationMs": 660000,
  "chapters": [
    {
      "id": "chapter_purpose",
      "title": "What Bunbun is",
      "summary": "A discussion service where ATProto is the source of truth and a local index serves reads.",
      "diagrams": [
        {
          "id": "diagram_sources_of_truth",
          "kind": "architecture",
          "title": "Records and the local index",
          "nodes": [
            { "id": "web", "label": "Web islands", "type": "client" },
            { "id": "api", "label": "NestJS API", "type": "service" },
            { "id": "pds", "label": "ATProto PDS", "type": "external" },
            { "id": "index", "label": "Local index", "type": "store" },
          ],
          "edges": [
            { "id": "edge_web_api", "from": "web", "to": "api", "kind": "calls" },
            { "id": "edge_api_index", "from": "api", "to": "index", "kind": "reads" },
            { "id": "edge_api_pds", "from": "api", "to": "pds", "kind": "writes" },
          ],
        },
      ],
      "beats": [
        {
          "id": "beat_purpose_01",
          "title": "Two sources, one conversation",
          "narration": "Bunbun keeps discussion records in the AT Protocol and serves reads from a local index. The index is a cache and a query surface, not a second source of truth.",
          "durationMs": 32000,
          "anchors": [
            {
              "id": "anchor_readme_overview",
              "path": "README.md",
              "lines": { "start": 3, "end": 3 },
              "contentHash": "sha256:…",
              "label": "Bunbun overview",
            },
          ],
          "stage": {
            "anchorIds": ["anchor_readme_overview"],
            "diagramId": "diagram_sources_of_truth",
            "nodeIds": ["pds", "index"],
            "edgeIds": ["edge_api_pds"],
          },
          "suggestedQuestions": [
            "Why keep a local index if the PDS is the source of truth?",
          ],
        },
      ],
    },
  ],
}
```

Key rules:

- IDs are stable, human-readable, and unique within the document.
- Anchors identify code by path and symbol when possible; line ranges are hints
  resolved by the compiler.
- Every anchor carries a content hash. A mismatch marks the tour stale rather
  than silently showing the wrong code.
- A beat's stage may show code, a diagram, or both.
- Diagrams belong to chapters and persist across beats; beats change focus.
- No HTML, JavaScript, raw SVG, or executable expressions are allowed in a tour.
- Narration text is plain text or a restricted Markdown subset with links to code
  pages and beats.

## 9. LLM authoring protocol

The model produces **instructions**, not presentation code. The authoring
pipeline has four stages:

### 9.1 Curriculum

The model receives a compact project brief (README, CONTEXT, manifests, docs
index, module clusters, entry points) and returns a `TourPlan`:

- chapters with titles, summaries, and learning goals;
- 2–5 beats per chapter with one idea each;
- target audience and depth;
- which diagrams are needed;
- coverage targets for entry points, core modules, and cross-cutting concerns.

### 9.2 Context packs

For each chapter, the pipeline builds a bounded context pack from the snapshot:

- module and symbol summaries;
- candidate code anchors with IDs, paths, symbols, and short excerpts;
- relevant docs and comments;
- the previous chapter's summary and the next chapter's goal.

The model never receives the whole repository. It receives enough evidence to
choose from, not a haystack.

### 9.3 Beat generation

For each beat, the model returns:

- a title and 40–120 words of narration;
- 1–3 anchor references chosen from the context pack;
- a diagram focus (existing diagram ID plus node/edge IDs, or a new diagram
  instruction);
- optional suggested questions;
- an estimated duration (the compiler recalculates it).

The system prompt enforces: one idea per beat, why before how, no invented
symbols, no unsupported claims, and a calm explanatory voice. Repository content
is wrapped as untrusted data and cannot change these instructions.

### 9.4 Validation and repair

Every draft is validated before it reaches the player:

1. JSON Schema and semantic checks (unique IDs, valid references, duration
   bounds, diagram size limits).
2. Anchor resolution against the snapshot. Missing paths, symbols, or hash
   mismatches fail.
3. Diagram validation. Unknown node/edge IDs, dangling anchors, cycles where a
   tree is required, and excessive node counts fail.
4. Narration checks. Word count, reading level, duplicate beats, and unsupported
   code references.
5. A bounded repair pass (at most two attempts) with precise error messages.
   Unrepairable beats are dropped and recorded in a quality report.

The quality report is part of the authoring output: anchor validity, coverage,
estimated duration, model calls, tokens, cost, and any dropped beats.

### 9.5 Caching and determinism

- Prompt cache key: snapshot ID + prompt version + model ID + context pack hash.
- Partial tours are saved after each chapter, so a failed run can resume.
- A fake `GuideModel` produces deterministic fixtures for tests and CI.
- A real model run is recorded with model ID, prompt version, and token counts,
  but its output is not required for the test suite.

## 10. Code anchoring and highlighting

### 10.1 Anchor resolution

The analyzer builds a symbol index with stable IDs:

```
symbol:apps/api/src/comments/comments.service.ts#CommentsService.create
symbol:apps/api/src/comments/comments.service.ts#CommentsService
file:apps/api/src/comments/comments.service.ts
```

A generated anchor may provide `path` + `symbol` or `path` + `lines`. The
compiler resolves the symbol first, then the line hint, then verifies the
content hash. If the symbol moved, the compiler can re-resolve within the same
file and mark the tour as updated; if the file changed, the tour is marked stale
for that anchor.

### 10.2 Code pages

Code pages are server-rendered with Shiki 4 using a dual light/dark theme.
Highlights are line decorations generated from the anchor. The page shows:

- repository path and symbol breadcrumb;
- the focused line range with a non-color-only marker;
- inline notes from the current beat;
- a link back to the player at the exact beat and offset;
- a stale badge and a diff hint when the source hash no longer matches.

Long files are virtualized. The first release does not embed an editor; it is a
read-only evidence view.

### 10.3 URL contract

- `/p/:projectId/source/<path>?anchor=<anchorId>&beat=<beatId>`
- `/t/:tourId/:beatId?t=<milliseconds>`

The URL is the durable link. It survives reloads and can be shared on the same
machine or deployment.

## 11. Diagram system

The model emits a `DiagramInstruction`:

- `kind`: `architecture`, `dependency`, `flow`, `tree`, or `sequence`;
- controlled node types: `module`, `service`, `store`, `client`, `queue`,
  `external`, `file`, `class`, `function`, `note`;
- controlled edge kinds: `calls`, `reads`, `writes`, `emits`, `renders`,
  `depends`, `contains`;
- nodes may carry an `anchorRef` so a click opens the code page;
- a `focus` set selects nodes and edges for a beat.

Layout is deterministic: ELK layered layout for architecture/dependency graphs,
a tidy tree for hierarchy, and a custom layout for sequence diagrams. Layout
results are cached by diagram content hash. React Flow renders the graph on the
stage; Motion animates focus changes and node transitions. Sequence diagrams use
a custom SVG renderer in Phase 4.

The renderer never trusts model-provided coordinates, colors, or sizes. Those
are derived from the IR and the design tokens.

## 12. Narration

Narration is optional per beat and switchable at runtime.

### 12.1 Adapters

- **Browser adapter** — Web Speech API. Narration is split into sentences; each
  sentence is one utterance. Boundary events provide character-level progress.
  Pause/resume works at sentence granularity when the browser is unreliable.
  No audio is cached; no API key is required.
- **Cloud adapter** — ElevenLabs `text-to-speech/{voice_id}/with-timestamps`
  returns MP3 audio plus character alignment. The adapter converts character
  times to word and sentence timings, stores the MP3 and alignment JSON under
  `SOTHSPELL_HOME`, and serves audio with HTTP range support. The official
  `@elevenlabs/elevenlabs-js` SDK is used; the REST contract is the fallback.
  Cloud narration sends the beat text to the provider, and the UI says so before
  the first cloud generation.

Both adapters ship in Phase 5. Browser narration is the default; cloud narration
is opt-in with a voice and API key. If neither works, the player falls back to
read mode without losing progress.

### 12.2 Synchronization

The player derives the active sentence and word from the audio clock or the
SpeechSynthesis boundary. Text reveals are driven by the same clock, so captions,
highlighting, and audio do not drift. Auto-advance uses the audio `ended` event
in listen mode and a duration estimate in read mode. Pause freezes the clock;
resume restores the exact offset.

## 13. Progress and privacy

- Anonymous local-first session. A signed `sothspell_session` cookie identifies a
  single-user local install; it is not an account.
- Runs are stored in SQLite and mirrored in IndexedDB for offline resilience.
- Questions and answers are stored with the run unless the user deletes them.
- Export/import is a JSON file; no cloud sync in the first release.
- Source excerpts sent to a model or TTS provider are disclosed in the UI and
  documented in `docs/privacy.md`.
- Logs redact API keys, absolute paths where possible, and source excerpts.
- The local server binds to loopback and rejects cross-origin state changes.

## 14. OpenCode plugin and harnesses

### 14.1 OpenCode V2

The plugin targets `@opencode/plugin` 2.0.32 and the V2 SDK. It uses:

- `Plugin.define` for lifecycle;
- `ctx.command.transform` to add `/sothspell` and `/sothspell status`;
- `ctx.tool.transform` to add generation/open/progress tools;
- `ctx.rpc.register` for a typed `Sothspell` RPC contract;
- `ctx.location` for the project root and project metadata;
- `ctx.vcs` for revision and dirty state;
- `ctx.storage` for small plugin settings;
- `ctx.generate.text` or `ctx.session.generate` as the GuideModel adapter, so the
  user's configured OpenCode model authors the tour without a second API key.

The plugin launches the local web player with the packaged `sothspell serve`
command and prints the URL in the session. It does not modify the target
repository. Tour artifacts, audio, and runs live under `SOTHSPELL_HOME`, shared
with the web app.

### 14.2 Other harnesses

The `@sothspell/harness` package defines the adapter contract. The web app and
the OpenCode plugin are the first two adapters, which is enough to justify the
seam. Other harnesses are a future track, not part of the first release. The
contract covers project root, revision, model call, storage, player launch, and
progress events; it does not expose the authoring internals.

## 15. Bunbun golden tour

The first reference project is the Bunbun checkout at
`/Users/ajc/Projects/codegens/bunbun`, commit `9fef24d` (2026-10-16), a NestJS +
Prisma Next + ATProto discussion service.

**Constraint: the Bunbun tree is read-only.** The analyzer opens it, hashes it,
and records the revision. All artifacts live in Sóþspell's own home. A test
asserts that `git -C /Users/ajc/Projects/codegens/bunbun status --porcelain` is
unchanged after analysis and playback.

The checked-in golden tour is `examples/bunbun-tour/`. It contains a small,
attributed set of excerpts, anchors, diagrams, and narration. It is pinned to
the commit and can be regenerated on demand; it is never written back into the
Bunbun tree.

### 15.1 Tour outline (19 beats, roughly 10–12 minutes narrated)

**Chapter 1 — What Bunbun is (3 beats)**

1. A discussion service on ATProto: users, buns, threads, comments; records are
   the source of truth.
2. Two surfaces, one conversation: the NestJS API and the local index; why the
   index exists.
3. Repository map: `apps/api`, `apps/web`, `apps/browser-acceptance`, `docs`,
   `plans`.

**Chapter 2 — From request to page (5 beats)** 4. Boot: `main.ts` → `AppModule`; fail-fast configuration, global validation,
filters, and middleware. 5. AppModule as the wiring seam: feature modules, global interceptor, filter
order. 6. The thread page: controller → `ThreadPageLoader` → page state. 7. The read model: `CommentThreadQuery` and the local comment index; how a tree
is assembled and why the PDS is not read on every page view. 8. Failure and view branches: not-found, takedown, label, age gate, error; how
the page loader returns a discriminated state instead of throwing.

**Chapter 3 — From comment to record (4 beats)** 9. The write guard: OAuth session restoration and the author identity boundary. 10. `CommentsService.create`: parse, validate thread and parent, compute root,
write the PDS record, update the index. 11. The adapter seam: `AtprotoCommentPdsAdapter` and the PDS write. 12. The index writer and cache invalidation: one writer, one invalidation event.

**Chapter 4 — Keeping the index honest (3 beats)** 13. The sync worker: why it runs in a worker thread and owns its own Prisma
client. 14. The reconcilers: threads, tags, and the bounded crawl. 15. Tags, moderation, and telemetry as cross-cutting evidence: where state
changes and where it is observed.

**Chapter 5 — The browser island (2 beats)** 16. `apps/web/src/main.ts`: one bundle, `data-island` mounting, unknown islands
ignored. 17. The comment composer and the island API wrapper: same-origin fetch, pending,
error, and draft behavior.

**Chapter 6 — Where to go next (2 beats)** 18. The docs and plans as the project's memory: `CONTEXT.md`, `docs/README.md`,
`plans/ROADMAP.md`. 19. Extension points: add a feature module, a page, an island, or an ATProto
record; how to verify it.

Every beat has at least one code anchor. Diagram nodes link to anchors where the
concept maps to code. The player can open a code page from any beat or diagram
node and return to the same offset.

## 16. Stack and versions

Versions checked with `pnpm view <package> version` on 2026-10-17. Pin exact
versions in the workspace catalog; do not float majors.

| Area            | Package                                     | Version                             |
| --------------- | ------------------------------------------- | ----------------------------------- |
| Runtime         | Node.js                                     | 26.12.0 (installed); `engines >=26` |
| Package manager | pnpm                                        | 12.14.0                             |
| Language        | TypeScript                                  | 7.0.2                               |
| UI              | React / React DOM                           | 19.3.1                              |
| Bundler         | Vite                                        | 8.3.4                               |
| Router          | TanStack Router                             | 1.170.45                            |
| Server state    | TanStack Query                              | 5.104.3                             |
| Virtualization  | TanStack Virtual                            | 3.14.21                             |
| API             | Hono                                        | 4.13.13                             |
| Validation      | Zod                                         | 4.6.7                               |
| LLM             | Vercel AI SDK                               | 7.0.143                             |
| LLM providers   | `@ai-sdk/openai` / `@ai-sdk/anthropic`      | 4.0.96 / 4.0.82                     |
| Code parsing    | `oxc-parser`                                | 0.154.0                             |
| Highlighting    | Shiki                                       | 4.5.0                               |
| Diagrams        | `@xyflow/react` / `elkjs`                   | 12.12.0 / 0.12.0                    |
| Motion          | `motion`                                    | 14.3.0                              |
| Styling         | Tailwind CSS / `@tailwindcss/vite`          | 4.3.3                               |
| Primitives      | `radix-ui`                                  | 1.8.1                               |
| Icons           | `@phosphor-icons/react`                     | 2.1.10                              |
| Fonts           | `@fontsource-variable/geist` / `geist-mono` | 5.3.0                               |
| Local DB        | `better-sqlite3`                            | 13.0.3                              |
| Local state     | `idb`                                       | 8.0.4                               |
| TTS             | `@elevenlabs/elevenlabs-js`                 | 2.73.0                              |
| OpenCode plugin | `@opencode/plugin`                          | 2.0.32                              |
| Tests           | Vitest                                      | 5.0.5                               |
| Browser tests   | Playwright / axe                            | 1.64.1 / 4.14.0                     |
| Lint / format   | oxlint / Prettier                           | 1.88.0 / 3.9.10                     |

### 16.1 TypeScript 7 constraints

TypeScript 7.0 is the native Go compiler and ships **without a programmatic
compiler API** (the new API is expected in 7.1). This is a hard architectural
constraint, not a version detail:

- Do not use `ts-morph`, `typescript-estree`, or any package that imports the
  classic `typescript` compiler API at runtime for AST work. Bunbun's own
  `issues/0016` records the failure mode.
- Use `oxc-parser` and `oxc-walker` for TypeScript/JavaScript syntax and symbol
  extraction.
- Avoid `vite-tsconfig-paths`; use package `exports` and relative imports.
- Type checking is `tsc -b --pretty false` from the TypeScript 7 package. Vite
  and Vitest transpile without type checking.
- Configure TS 7 defaults explicitly: `strict`, `module: "esnext"`,
  `moduleResolution: "bundler"`, `rootDir`, and `types`. `baseUrl` and
  `moduleResolution: "node"` are not available.
- Do not use Svelte, Vue, Angular, or MDX toolchains that embed the TypeScript 6
  language service; React + Vite is the supported path.
- Add a toolchain guard: `tsc --version` must report 7.x, and the lockfile must
  not contain a classic-compiler-API dependency used by application code.

## 17. Security and trust model

- **Local by default.** Bind to `127.0.0.1`; remote access is an explicit,
  documented opt-in with a warning.
- **Read-only source.** Path allowlist, `realpath` containment, symlink checks,
  and no writes, installs, or code execution. Ignore `.git`, `node_modules`,
  build output, `.env*`, keys, and known secret files.
- **Secret redaction.** Detect common key patterns and refuse to send matching
  excerpts to a model. Log a warning instead of silently leaking.
- **Untrusted repository content.** README, comments, and source strings are data,
  never instructions. Wrap them in delimiters and keep the system prompt outside
  the data.
- **No model-generated presentation code.** Only the tour schema, diagram IR,
  and restricted Markdown are accepted. HTML and SVG are rejected.
- **State-changing routes** require same-origin `Origin` checks, a signed
  anonymous cookie, and rate limits. The local server is not a general proxy.
- **CSP and sanitization.** Strict CSP in production; no raw HTML from model
  output; React escaping plus a Markdown sanitizer.
- **Cost controls.** Per-run and per-day token/audio budgets; cancellation;
  resumable generation; clear model/provider choice.
- **Privacy disclosure.** The UI says when source excerpts or narration text are
  sent to a cloud provider, and offers local-only text mode.

## 18. Testing strategy and seams

Tests verify behavior at public interfaces. Proposed seams, to confirm before
the first Phase 1 test:

1. `core/compiler`: `compileSothspell(document, snapshot) → CompiledTour`.
2. `analyzer`: `analyzeProject(root, options) → ProjectSnapshot`.
3. `authoring`: `authorTour(snapshot, model, options) → TourDraft`.
4. `player`: `createPlayback(compiled, options) → Playback`.
5. `narration`: `synthesize(text, voice) → NarrationSegment`.
6. `progress`: `ProgressStore.load/save/merge`.
7. HTTP boundary: Hono `app.request` for tour, source, ask, progress routes.
8. OpenCode plugin: plugin setup, command/tool registration, and RPC contract.

What each catches and misses:

- Compiler seam catches invalid anchors, broken references, and duration drift;
  it does not prove the narration is pedagogically good.
- Analyzer seam catches path escapes, parser failures, and symbol drift; it does
  not prove semantic type correctness.
- Authoring seam catches unsupported anchors, schema violations, and budget
  overruns; it does not prove factual truth beyond the supplied evidence.
- Player seam catches timing, pause/resume, seek, and progress transitions; it
  does not catch visual layout regressions.
- Playwright catches real browser behavior and accessibility; it is slower and
  needs a running server.
- A checked-in golden tour catches artifact regressions and the Bunbun
  read-only guarantee; it can go stale when Bunbun moves.

Test layers:

- **Unit** — Vitest, pure functions, fake clock, fake model, fake TTS.
- **Integration** — Hono `app.request`, temp `SOTHSPELL_HOME`, temp SQLite,
  real analyzer against a small fixture and the Bunbun checkout when present.
- **Golden** — compile the checked-in Bunbun tour; assert every anchor resolves,
  every diagram validates, and the artifact hash is stable.
- **Browser** — Playwright Chromium/Chrome, keyboard-only pass, pause/resume,
  code link, diagram node, progress reload.
- **Accessibility** — axe-core with a hard gate of 0 critical / 0 serious on every
  page and player state.
- **Security** — traversal/symlink escape, secret redaction, prompt-injection
  attempts, cross-origin writes, rate limits.
- **Performance** — analyzer budget on Bunbun, player LCP, bundle budget,
  diagram layout budget.

Verification commands (once scaffolded):

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm test:browser
pnpm test:a11y
pnpm build
pnpm dev
pnpm sothspell analyze /Users/ajc/Projects/codegens/bunbun
pnpm sothspell author /Users/ajc/Projects/codegens/bunbun --out examples/bunbun-tour
git -C /Users/ajc/Projects/codegens/bunbun status --porcelain
```

The last command must print nothing.

## 19. Phase sequence

```
Phase 1  Foundation & Sóþspell format
   │
   ├──► Phase 2  Repository intelligence
   │        │
   │        └──► Phase 3  LLM authoring pipeline
   │                 │
   │                 └──► Phase 4  Cinematic player & code browser
   │                          │
   │                          └──► Phase 5  Narration & accessibility
   │                                   │
   │                                   └──► Phase 6  Semi-interactive guide & progress sync
   │                                            │
   │                                            └──► Phase 7  OpenCode V2 plugin
   │                                                     │
   └─────────────────────────────────────────────────────┴──► Phase 8  Self-hosted release & hardening
```

Phases 1–3 can overlap only at their seams: Phase 2 can build the analyzer
against the Phase 1 fixture format, and Phase 3 can use a fake analyzer until
Phase 2 lands. Phase 4 needs a valid compiled artifact but can build the code
browser before the full authoring pipeline. Phase 5 needs the player's timing
seam. Phase 6 needs progress storage and a stable Q&A context. Phase 7 needs the
local server and the artifact format; the Phase 8 packaging work can start during
Phase 7. Phase 8 is the release gate.

| Phase | Status                | Primary outcome                                                                                                                                     |
| ----- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | complete (2026-10-17) | Toolchain, schema, compiler, hand-authored Bunbun tour, minimal player ([closure record](PHASE-1.md#shipped-closure-2026-10-17))                    |
| 2     | complete (2026-10-17) | Read-only snapshot, TS/JS symbol graph, project brief, CLI ([closure record](PHASE-2.md#shipped-closure-2026-10-17))                                |
| 3     | complete (2026-10-17) | GuideModel, context packs, curriculum, chapter generation, validation, repair, author CLI ([closure record](PHASE-3.md#shipped-closure-2026-10-17)) |
| 4     | complete (2026-10-17) | Cinematic player, virtualized code browser, local run persistence ([closure record](PHASE-4.md#shipped-closure-2026-10-17))                         |
| 5     | planned               | Browser + cloud narration, captions, accessibility gate                                                                                             |
| 6     | planned               | Q&A interludes, drilldown, resumable runs                                                                                                           |
| 7     | planned               | OpenCode V2 command/tools/RPC, local player launch                                                                                                  |
| 8     | planned               | Packaging, security, performance, docs, release verification                                                                                        |

Phase 1 shipped the workspace, schema, generated JSON Schema, compiler, the
checked-in golden Bunbun tour (6 chapters, 19 beats, 20 anchors, pinned to
`9fef24d`), the Hono API, the minimal React player, IndexedDB progress, and the
TypeScript 7 toolchain guard. The full closure evidence lives in
[`PHASE-1.md`](PHASE-1.md#shipped-closure-2026-10-17).

Phase 2 shipped the read-only analyzer, `oxc-parser` symbol extraction, file and
package import graphs, approximate reference edges, Prisma models, the
deterministic project brief, the per-file cache, snapshot save/load, and the
`sothspell analyze` CLI. On Bunbun at `9fef24d` it produces 642 files, 10,040
symbols, 1,588 file imports, and 822 package imports in about 0.8 s cold and
0.17 s warm, with the Bunbun worktree unchanged. The full evidence lives in
[`PHASE-2.md`](PHASE-2.md#shipped-closure-2026-10-17).

Phase 3 shipped the `GuideModel` port, AI SDK and fixture adapters, bounded
context packs, curriculum planning, chapter and diagram generation, validation,
bounded repair, the authoring cache, quality reports, the `sothspell author`
CLI, and the `sothspell-author` skill. The pipeline is verified end to end with
the deterministic fixture model; a reviewed real-model Bunbun tour is owner-gated
on provider credentials. The full evidence lives in
[`PHASE-3.md`](PHASE-3.md#shipped-closure-2026-10-17).

Phase 4 shipped the cinematic player: speed control, scrubber, theater mode,
completed-beat tracking, keyboard control, diagram keyboard/focus interaction,
sequence-diagram rendering, a virtualized full-file code browser with anchor
outlines and stale badges, and local-first run persistence with a SQLite mirror.
The full evidence lives in [`PHASE-4.md`](PHASE-4.md#shipped-closure-2026-10-17).

## 20. Risks and open questions

### Risks

1. **Model truthfulness.** The validator can prove anchors exist; it cannot prove
   every sentence is a fair reading of the code. Mitigation: evidence-only
   prompts, a second critique pass, a quality report, and a human review option.
2. **Context cost and latency.** A full tour can require many model calls.
   Mitigation: hierarchical context packs, caching, resumable generation, and a
   small default tour.
3. **TypeScript 7 ecosystem gaps.** Some tools still need the TS 6 compiler API.
   Mitigation: the constraints in §16.1, `oxc-parser`, and a dependency guard.
4. **Narration quality and sync.** Browser voices vary; cloud alignment needs
   normalization. Mitigation: sentence-level browser chunks, word timings from
   the provider, and text-only fallback.
5. **Diagram readability.** Generated graphs can become hairballs. Mitigation:
   node/edge limits, controlled vocabulary, deterministic layout, and a
   readability check in the validator.
6. **Prompt injection from repository content.** Mitigation: untrusted-data
   framing, no tool access during authoring, schema-only output, and validation.
7. **Scope creep into a general documentation platform.** Mitigation: the first
   release is a self-hosted walkthrough player with a checked-in Bunbun tour and
   one OpenCode plugin; hosted collaboration is future work.
8. **Local server security.** A loopback server still has a browser surface.
   Mitigation: Origin checks, signed sessions, rate limits, CSP, and no remote
   binding by default.

### Open questions

- Cloud TTS provider: ElevenLabs is the default because of character timings;
  OpenAI TTS remains an adapter candidate if its timing story improves.
- Multi-language analyzers: TypeScript/JavaScript first (Bunbun), then Python,
  Go, and Rust based on demand.
- Accounts and hosted sync: deferred; the run export/import format is the bridge.
- Human review workflow: a CLI quality report in Phase 3; a review UI is future.
- Tour length default: 10–12 minutes for Bunbun; user-selectable depth later.
- Branding: the wordmark uses `sóþspell`; package names and URLs use `sothspell`.
- Licensing: to be decided before the public release.

## 21. Success metrics

First-release targets:

- A new user can go from a local path to a playable Bunbun tour in under five
  minutes with a configured model, or instantly with the golden tour.
- 100% of code anchors in the golden tour resolve against the pinned snapshot.
- 0 critical or serious axe violations in the player and code browser.
- Pause/resume returns to within 150 ms of the saved position.
- A run survives a page reload and a server restart.
- Every beat is readable with narration disabled.
- The Bunbun repository is byte-for-byte unchanged after a full analysis, tour
  generation, playback, and plugin run (`git status --porcelain` empty).
- Analyzer budget on Bunbun: under 60 seconds on the development machine.
- Player LCP on the local server: under 2.5 seconds on a mid-range laptop.

## 22. Research and references

Product research:

- DeepWiki / Devin repository wikis: <https://docs.devin.ai/work-with-devin/deepwiki>
- DeepWiki product: <https://deepwiki.com/>
- CodeSee AI features: <https://docs.codesee.io/docs/ai-in-codesee>
- CodeSee overview: <https://docs.codesee.io/docs/getting-started>
- Swimm: <https://swimm.io/>
- VS Code CodeTour: <https://marketplace.visualstudio.com/items?itemName=vsls-contrib.codetour>
- LACY code tours paper: <https://arxiv.org/html/2603.25391>
- GitDiagram: <https://github.com/ahmedkhaleel2004/gitdiagram>
- Scrimba: <https://scrimba.com/>
- NotebookLM Audio Overviews: <https://blog.google/innovation-and-ai/products/notebooklm-audio-overviews/>
- CodeSee alternatives / GitKraken Codemaps context:
  <https://repowise.dev/blog/comparisons/codesee-alternatives-codebase-maps>

Technical references:

- TypeScript 7.0 announcement: <https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/>
- AI SDK structured data: <https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data>
- OpenCode V2 plugins: <https://opencode.ai/v2/docs/build/plugins>
- OpenCode V2 RPC: <https://opencode.ai/v2/docs/build/plugins/rpc>
- OpenCode V2 SDK: <https://opencode.ai/v2/docs/build/sdk>
- ElevenLabs speech with timing: <https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps>
- Shiki transformers: <https://shiki.style/guide/transformers>
- Oxc parser: <https://oxc.rs/docs/guide/usage/parser>
- React Flow: <https://reactflow.dev/>
- ELK: <https://github.com/kieler/elkjs>
- axe-core: <https://github.com/dequelabs/axe-core>

## 23. Working agreements

- pnpm only; never npm or yarn.
- TypeScript 7, strict, with the constraints in §16.1.
- Bunbun is read-only. No command may write inside
  `/Users/ajc/Projects/codegens/bunbun`.
- Plans and docs are updated when behavior or decisions change.
- Every phase starts by confirming its test seams, and every bug fix gets a
  regression test.
- Use `tdd`, `codebase-design`, and `caveman` skills; use `opencode` for V2
  plugin work and `design-taste-frontend` for UI work.
- Commit each completed wave with a descriptive message. Keep the working tree
  changes; do not discard user work.
- Verify with fresh output: typecheck, lint, tests, build, browser acceptance,
  accessibility, and the Bunbun read-only check.
