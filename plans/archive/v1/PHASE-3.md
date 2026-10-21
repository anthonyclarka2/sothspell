# Phase 3 — LLM Authoring Pipeline

**Status: complete (2026-10-17).** Depends on: Phase 1 (format/compiler), Phase 2
(snapshot and symbol graph). The pipeline is implemented and verified with the
deterministic fixture model; a reviewed real-model Bunbun tour is owner-gated on
provider credentials.

**Deliverable:** a model-backed authoring pipeline that takes a project snapshot
and produces a valid, evidence-anchored Sóþspell: curriculum, chapters, beats,
diagrams, citations, validation, repair, caching, and a CLI. Bunbun is the
acceptance project.

## Goal

Generate a truthful, well-paced walkthrough from a repository. The pipeline's
job is not to write beautiful prose in one pass; it is to produce a draft that
survives validation, cites real code, and can be resumed and reviewed.

The output is a `TourDraft` that compiles with the Phase 1 compiler and is
suitable for the Phase 4 player.

## Why this order

- The format and compiler are stable.
- The analyzer can resolve symbols and hashes.
- The golden tour gives a quality target.
- The player can be built against real generated tours instead of only a
  hand-authored fixture.

## Scope

### In scope

- A `GuideModel` port with an AI SDK 7 adapter and a deterministic fake model.
- Structured output through Zod/JSON Schema.
- A context pack builder with token budgets and anchor candidates.
- A curriculum planner.
- A beat author and diagram planner.
- Validation and bounded repair.
- Caching, resumable generation, and cost accounting.
- A quality report.
- A CLI: `sothspell author <path>`.
- A checked-in generated Bunbun draft, produced with a real model and reviewed
  manually.
- Prompt/version files and an authoring skill.

### Out of scope

- Q&A and drilldown (Phase 6).
- Narration audio (Phase 5).
- The full cinematic player (Phase 4).
- Hosted model proxying or accounts.
- Automated factual review beyond anchor and evidence checks.

## Decisions

1. **The model emits only schema-shaped data.** No HTML, no scripts, no raw SVG,
   no Mermaid strings. Diagrams are `DiagramInstruction` objects.
2. **Anchor candidates are supplied.** The model chooses from enumerated anchor
   IDs, paths, and symbols. It does not invent line numbers. This is the strongest
   practical defense against hallucinated code references.
3. **Two-pass authoring.** First plan the curriculum, then write beats chapter by
   chapter. A short critique pass checks coverage and redundancy before compile.
4. **Evidence before style.** Every beat must cite at least one anchor. A beat
   with no anchor is only allowed for pure orientation (for example, a chapter
   intro), and the validator must mark it as such.
5. **Bounded repair.** At most two repair attempts per beat. Unrepairable beats
   are dropped and recorded, not silently patched.
6. **The model is replaceable.** The web app uses AI SDK providers; the OpenCode
   plugin uses the host's model; tests use a fake. The pipeline depends on a
   small `GuideModel` interface, not a provider SDK.
7. **Deterministic fixtures.** CI never calls a real model. A recorded fixture
   proves the pipeline shape; a manual real-model run proves quality.
8. **Repository content is untrusted.** Source, docs, and comments are data.
   Prompt-injection attempts cannot alter the system instructions or the output
   schema.

## Waves

### Wave 0 — GuideModel port and provider adapters

1. Define the port:
   ```ts
   interface GuideModel {
     readonly id: string;
     generateObject<T>(input: {
       schema: StandardSchemaV1<T>;
       system: string;
       prompt: string;
       signal?: AbortSignal;
     }): Promise<{ value: T; usage?: ModelUsage }>;
     generateText(input: {
       system: string;
       prompt: string;
       signal?: AbortSignal;
     }): Promise<{ text: string; usage?: ModelUsage }>;
   }
   ```
2. AI SDK adapter:
   - `generateObject` via AI SDK 7 `Output.object` or provider-native structured
     output where supported;
   - `generateText` for streaming/answers;
   - model selection from `SOTHSPELL_MODEL` and provider keys;
   - normalized usage and cost metadata.
3. Fake model:
   - returns fixture objects by prompt/step;
   - can simulate invalid anchors, schema errors, and repair success;
   - records calls for assertions.
4. Tests: adapter shape, fake model determinism, cancellation, usage
   normalization.

### Wave 1 — Context packs

1. Build a `ContextPack` for the curriculum and for each chapter:
   - project brief;
   - chapter goal and previous/next summaries;
   - module clusters and representative symbols;
   - anchor candidates with IDs, path, symbol, line hint, excerpt, and hash;
   - docs excerpts (README, CONTEXT, docs index, relevant guides);
   - constraints (audience, depth, max beats, duration).
2. Token budget:
   - default 24k–40k input tokens per call, configurable;
   - never include a file above the excerpt cap;
   - deduplicate candidates;
   - prioritize entry points, high fan-in symbols, and chapter-relevant paths.
3. Anchor candidate selection:
   - symbol summaries from the analyzer;
   - exact excerpt ranges (for example, a class signature plus one method);
   - stable IDs;
   - no secret-redacted content.
4. Tests:
   - context pack respects the budget;
   - candidates are deterministic;
   - a redacted file never appears;
   - a prompt-injection string is wrapped as data and does not change the
     system prompt.

### Wave 2 — Curriculum planner

1. Define `TourPlan`:
   - title, subtitle, audience;
   - chapters with title, summary, goal, beat budget;
   - required coverage: entry points, request path, write path, persistence,
     cross-cutting concerns, extension points;
   - diagram plan per chapter;
   - estimated duration.
2. Prompt:
   - “Explain this project from purpose to parts, then drill into the request
     and write paths.”
   - require 1–3 anchors per planned beat;
   - require an explicit coverage checklist;
   - forbid chapters that only list files.
3. Validate:
   - 3–8 chapters;
   - 2–5 beats per chapter;
   - every required coverage item assigned;
   - no duplicate chapter goals;
   - total duration within 6–15 minutes.
4. Tests with fake model: valid plan, missing coverage, too many chapters,
   duplicate goals.

### Wave 3 — Beat and diagram authoring

1. Beat prompt:
   - one idea per beat;
   - 40–120 words of narration;
   - choose 1–3 anchor IDs from the context pack;
   - reference an existing chapter diagram and focus nodes/edges, or request a
     new diagram;
   - include suggested questions;
   - explain why before how;
   - no claims beyond the anchors.
2. Diagram prompt:
   - allowed node/edge types;
   - max 16 nodes, 24 edges;
   - short labels (max four words);
   - nodes may carry anchor IDs;
   - choose the diagram kind that fits the idea;
   - no coordinates or colors.
3. Structured output schemas:
   - `BeatDraft`;
   - `DiagramInstruction`;
   - `ChapterDraft`;
   - `TourDraft`.
4. Compile a chapter as soon as it is complete; save partial results.
5. Tests with fake model: beat with valid anchors, beat with an unknown anchor,
   diagram with a dangling node, oversized diagram, missing narration.

### Wave 4 — Validation, repair, and quality report

1. Validators:
   - schema and semantic IDs;
   - anchor resolution against the snapshot;
   - hash match or explicit stale marker;
   - diagram references and size limits;
   - narration word count and reading level;
   - duplicate beats and repeated phrasing;
   - required coverage from the plan.
2. Repair:
   - send the validator error list back to the model with the same context;
   - max two attempts;
   - on failure, drop the beat and record a `QualityIssue` with the reason.
3. Quality report:
   - anchor validity rate;
   - coverage checklist;
   - chapter/beat counts;
   - estimated duration;
   - model calls, tokens, cost;
   - dropped beats and warnings;
   - a list of beats with only orientation anchors.
4. Human review artifact:
   - Markdown report with chapter summaries, beat text, anchor links, and
     warnings;
   - the report is generated next to the tour artifact, never inside the target
     repository.
5. Tests: repair loop, drop policy, report contents, idempotence.

### Wave 5 — CLI, caching, and resumability

1. CLI:
   ```bash
   pnpm sothspell author /path/to/project \
     --out "$SOTHSPELL_HOME/projects/bunbun/tours" \
     --audience new-contributor \
     --model <provider/model> \
     --max-minutes 12
   ```
2. Cache:
   - key: snapshot ID + prompt version + model ID + context pack hash;
   - store raw model responses and parsed drafts;
   - reuse across runs when inputs are unchanged.
3. Resumability:
   - write `plan.json` and per-chapter drafts;
   - resume after a model error or cancellation;
   - never leave a half-written tour that compiles as complete.
4. Cost controls:
   - per-run token budget;
   - max repair attempts;
   - cancellation;
   - clear error when the budget is exhausted.
5. Tests: cache hit, resume, budget exhaustion, cancellation.

### Wave 6 — Prompts, skill, and Bunbun acceptance

1. Put prompts in `packages/authoring/prompts/` with a version:
   - `system.md`;
   - `curriculum.md`;
   - `beat.md`;
   - `diagram.md`;
   - `repair.md`;
   - `critique.md`.
2. Add an authoring skill at `skills/sothspell-author/SKILL.md` for agents that
   need to author or review a tour manually. The skill points to the schema and
   the quality gates; it does not duplicate the prompts.
3. Generate a Bunbun tour with a real model:
   - use the roadmap's 19-beat outline as the target;
   - compare chapter coverage, anchor validity, and duration;
   - review every beat manually for truthfulness;
   - commit the generated draft under `examples/bunbun-generated/` with model,
     prompt version, date, and review notes.
4. Acceptance gates:
   - 100% of anchors resolve;
   - 0 unrepairable beats in the final draft (dropped beats are reported and
     reviewed);
   - 6–8 chapters, 15–22 beats;
   - 8–15 minutes estimated;
   - every required coverage item present;
   - no beat without an anchor except orientation beats;
   - no source writes.
5. Run the pipeline against a small synthetic fixture with a fake model in CI.

## Test seams

Confirm before the first test:

1. `authorTour(snapshot, model, options) → TourDraft` (authoring).
2. `buildContextPack(snapshot, plan, options) → ContextPack`.
3. `validateTour(draft, snapshot, plan) → ValidationResult`.
4. `repairTour(draft, issues, model, options) → TourDraft`.
5. CLI `sothspell author` output and exit codes.
6. Cache key and resume behavior.

What they cover and miss:

- Authoring: catches invalid anchors, schema violations, and budget overruns;
  misses subtle factual errors that still cite real code.
- Context: catches budget and redaction issues; misses whether the selected
  evidence is the most pedagogically useful.
- Validation: catches broken references and structural problems; misses bad
  explanations.
- Repair: catches repairable failures; misses model stubbornness.
- CLI/cache: catches operational behavior; misses quality.

## Exit criteria (measurable)

1. `sothspell author` produces a compilable Bunbun tour with 100% valid anchors.
2. The generated tour covers all six chapters in the roadmap outline and the
   key symbols listed in Phase 2.
3. Estimated duration is 8–15 minutes; beat count is 15–22.
4. Every beat has narration, a stage, and at least one anchor (orientation beats
   excepted and reported).
5. Every chapter has at least one valid diagram; no diagram exceeds 16 nodes.
6. The quality report records anchor validity, coverage, model calls, tokens,
   cost, and dropped beats.
7. A rerun with the same snapshot and fake model is byte-identical (modulo
   timestamps).
8. A cancelled run resumes without duplicating chapters or losing a completed
   chapter.
9. A secret-redacted file never appears in a prompt or a tour excerpt.
10. `git -C /Users/ajc/Projects/codegens/bunbun status --porcelain` is empty.
11. `pnpm typecheck`, `pnpm lint`, and `pnpm test` are green.

## Risks and mitigations

- **Hallucinated code claims.** Anchor candidates and schema validation reduce
  the surface; the critique pass and manual review catch the rest. The product
  should never claim automated factual proof.
- **Context limits.** Hierarchical packs and per-chapter calls keep input
  bounded. If a chapter does not fit, split it rather than truncating silently.
- **Cost.** Cache aggressively, default to a small tour, and show an estimate
  before a real run.
- **Model variance.** Pin model IDs in the artifact; record prompt versions;
  keep a reviewed golden draft.
- **Prompt injection.** Treat repository text as data, wrap it, strip control
  characters, and never allow tool calls during authoring.
- **Repair loops.** Bound attempts and fail visibly; a dropped beat is better
  than a fabricated one.
- **Schema drift.** Schema version and prompt version are stored with every
  tour; a compiler migration is required for breaking changes.

## Working style

- Sequential. The fake model and validators land before the real AI SDK adapter
  is used for quality work.
- Use `tdd`; write the validator tests before the prompts.
- Use `codebase-design`; keep the authoring pipeline behind `authorTour`.
- Record real model runs with date, model, prompt version, cost, and review
  notes.
- Do not tune prompts against a single Bunbun sentence; check the synthetic
  fixture too.

## Shipped (closure, 2026-10-17)

- **Model port and adapters** — `GuideModel` with `generateObject`/`generateText`,
  usage normalization, an AI SDK 7 adapter for `openai/<model>` and
  `anthropic/<model>`, and a recording `FakeGuideModel`.
- **Context packs** — candidate anchors from feature modules, entry points, and
  exported declarations; short excerpts, content hashes, docs, and an estimated
  token count. Redacted files never enter the pack.
- **Curriculum** — `TourPlanSchema` (3–8 chapters, 2–5 beats each, goals and
  coverage checklists), prompt templates under `packages/authoring/prompts/`,
  and plan validation before any chapter is written.
- **Chapter authoring** — `ChapterDraftSchema` with one diagram instruction and
  2–5 beats; anchors must come from candidate IDs; diagram focus IDs must exist.
  Validation covers unknown anchors, dangling focus IDs, duplicate titles, and
  30–180 word narration, with up to two repair attempts per chapter. Failed
  chapters are dropped and recorded.
- **Assembly and quality** — normalized chapter/beat/diagram IDs, candidate
  resolution to `CodeAnchor`s with hashes and excerpts, `parseSothspell`
  validation, and a `quality.json` report with chapters, beats, anchors, dropped
  chapters, issues, duration, model calls, cache hits, usage, model ID, and
  prompt version.
- **Cache and CLI** — model calls cached by model/prompt/schema/system/prompt
  hash; `sothspell author <path>` with `--model`, `--out`, `--audience`,
  `--max-minutes`, and `--no-cache`; `--model fixture` produces a deterministic
  offline tour. `pnpm sothspell` remains the entrypoint.
- **Fixture pipeline and skill** — `createFixtureGuideModel` exercises the real
  pipeline without a provider key; `skills/sothspell-author/SKILL.md` is the
  author/review/repair checklist.

### Closure verification (fresh output, 2026-10-17)

- `pnpm typecheck` → 0 errors.
- `pnpm lint` → 0 errors, 0 warnings.
- `pnpm test` → 18 files / 61 tests passed, including the Bunbun authoring
  acceptance test and the authoring repair/cache tests.
- `pnpm test:browser` → 6 passed.
- `pnpm test:a11y` → 3 passed; 0 critical/serious.
- `pnpm build` → web build succeeds (161.25 kB gzip).
- `pnpm check:toolchain` → TypeScript 7.0.2, no classic compiler API packages.
- Fixture Bunbun authoring: 4 chapters, 8 beats, 8 anchors, 0 dropped chapters,
  5 model calls cold / 0 calls and 5 cache hits warm, compiled by the core
  compiler.
- `git -C /Users/ajc/Projects/codegens/bunbun status --porcelain` → empty before
  and after.

### Owner-gated item

A reviewed real-model Bunbun tour was not generated in this environment because
no provider key is present (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and
`SOTHSPELL_MODEL` are unset). The command is ready:

```bash
SOTHSPELL_MODEL=openai/gpt-5.2 pnpm sothspell author \
  /Users/ajc/Projects/codegens/bunbun --out /tmp/bunbun-tour
```

Review `quality.json`, run the checklist in
[`skills/sothspell-author/SKILL.md`](../../../skills/sothspell-author/SKILL.md), and
commit the generated tour only after that review. Until then the checked-in
golden tour remains the reviewed artifact.

### Deviations from the plan

- The chapter schema uses candidate IDs rather than raw `{path, symbol, lines}`
  refs. The model chooses evidence from a supplied set; the pipeline resolves the
  excerpt and hash. This is a stronger guarantee against invented line ranges.
- Real-model output is not committed; the owner gate is recorded above.
- `generateText` is part of the model port for Phase 6 Q&A, but the authoring
  pipeline itself is structured-output only.
