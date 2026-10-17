# Tour Authoring

The authoring pipeline turns a project snapshot into a Sóþspell: a curriculum,
chapters, beats, diagrams, and cited code anchors. It never writes to the
project and never trusts a model-provided file or line range.

## Command

```bash
# deterministic offline tour (tests, demos without a provider key)
pnpm sothspell author /path/to/project --model fixture --out /tmp/tour

# real provider
SOTHSPELL_MODEL=openai/gpt-5.2 pnpm sothspell author /path/to/project --out /tmp/tour
pnpm sothspell author /path/to/project --model anthropic/claude-sonnet-4-6 \
  --audience technical-evaluator --max-minutes 10 --out /tmp/tour
```

Options:

- `--model <provider>/<model>` or `fixture`; falls back to `SOTHSPELL_MODEL`.
- `--audience new-contributor | technical-evaluator | maintainer`.
- `--max-minutes <n>` passed to the curriculum planner.
- `--out <dir|file.json>`; defaults to
  `$SOTHSPELL_HOME/projects/<slug>/tours/<tourId>/`.
- `--no-cache` ignores analysis and authoring caches.

The command writes `tour.json` and `quality.json`. A file ending in `.json`
writes the tour there and the quality report beside it.

## Pipeline

1. **Snapshot** — `sothspell analyze` produces files, symbols, imports, docs,
   Prisma models, and the project brief.
2. **Context pack** — candidate anchors come from feature modules, entry points,
   and exported declarations. Each candidate carries a short excerpt and a
   content hash. Redacted files are never candidates.
3. **Curriculum** — the model returns a `TourPlan`: 3–8 chapters, 2–5 beats per
   chapter, a goal and coverage checklist each. The plan is validated before any
   chapter is written.
4. **Chapter** — the model returns one `ChapterDraft` with a diagram and 2–5
   beats. Beats cite candidate IDs, not raw line numbers. Diagram focus IDs must
   exist in the chapter diagram.
5. **Validation** — unknown anchors, dangling diagram IDs, duplicate titles, and
   narration outside 30–180 words are issues.
6. **Repair** — up to two repair attempts per chapter with the issue list. A
   chapter that still fails is dropped and recorded.
7. **Assembly** — IDs are normalized, candidates become `CodeAnchor`s with
   hashes and excerpts, and `parseSothspell` gets the final word.

## Quality report

`quality.json` records:

- planned vs written chapters and beat/anchor counts;
- dropped chapters and every issue;
- estimated duration;
- model calls, cache hits, and token usage;
- prompt version and model ID.

A usable tour has zero dropped chapters, 3–8 chapters, 8–40 beats, and every
anchor valid. The compiler must accept the document before it is shared.

## Providers

The model port is `GuideModel`. Two adapters exist:

- **AI SDK 7** — `openai/<model>` and `anthropic/<model>` with the provider key
  in the environment (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).
- **Fixture** — `--model fixture`; deterministic, offline, and useful for tests
  and smoke runs. It is not a reviewed tour.

The OpenCode V2 plugin will provide a third adapter using the host's configured
model.

## Caching and cost

Model calls are cached under `$SOTHSPELL_HOME/cache/authoring/llm` by model ID,
prompt version, schema name, system prompt, and user prompt. A repeat run with
unchanged inputs makes zero provider calls and reuses the parsed objects. A
changed context pack, prompt, or model produces a new key.

## Read-only and privacy

- The analyzer reads the project; authoring reads only the snapshot and short
  excerpts.
- Redacted files never enter the context pack.
- Tour artifacts are written outside the project.
- Repository content is untrusted data. Prompt-injection text cannot change the
  system instructions or the output schema.

## Real-model status

The pipeline is implemented and verified end to end with the fixture model. A
reviewed real-model Bunbun tour is owner-gated on provider credentials; run the
command above with `SOTHSPELL_MODEL` set, review `quality.json`, and commit the
generated tour only after the review checklist in
[`skills/sothspell-author/SKILL.md`](../skills/sothspell-author/SKILL.md).
