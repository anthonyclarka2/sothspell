# Guide and Interludes

The guide answers questions inside a tour without turning the player into a
chat product. The tour pauses, the guide answers with cited anchors, and the
reader continues at the same position.

## Asking

`POST /api/tours/:tourId/ask` accepts:

```json
{
  "beatId": "beat_purpose_01",
  "question": "How does a comment reach the PDS?",
  "history": [{ "question": "…", "answer": "…" }]
}
```

The API requires `SOTHSPELL_MODEL` (for example `openai/gpt-5.2`) and returns:

- `answer.markdown` — the explanation;
- `citations` — validated tour anchors with path and line range;
- `followUps` — suggested next questions;
- `warnings` — unsupported citations or an answer without evidence;
- `modelId`.

Unsupported citations are dropped. The answer is an interlude: the tour document
is never modified.

## Interlude UI

The player's **Ask about this beat** action:

1. pauses read playback or narration;
2. sends the question with the current beat and a bounded history;
3. renders the answer and its evidence links;
4. opens a cited code page in a new tab so the interlude is preserved;
5. **Continue tour** resumes if the tour was playing before the question.

## Context

The ask pipeline uses the current beat, chapter summary, tour outline, the
beat's anchors, a few nearby anchors, and up to three prior question/answer
pairs. Redacted files never enter the context. Repository content is untrusted
data and cannot change the system prompt or answer schema.

## Drilldown

`generateDrilldown` produces a one-chapter side tour from a selected anchor. It
validates the chapter against the same rules as the main authoring pipeline and
assembles a normal Sóþspell document. The API/UI link for launching a drilldown
is the remaining Phase 6 follow-up; the generator is covered by tests.

## Progress

Runs are local-first and mirrored to SQLite. A reload or server restart resumes
the newer of the local and server copies and unions completed beats. The run
mode (read/listen), speed, beat, offset, and completed beats are stored. The ask
history is currently session-local; persisting it with the run is part of the
Phase 6 follow-up.

## Limits

- No streaming of answer tokens yet; the request resolves with the full answer.
- No per-run/daily cost governor yet; the CLI and API rely on provider limits.
- A reviewed real-model answer set is owner-gated on provider credentials.
