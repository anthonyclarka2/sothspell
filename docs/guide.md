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

## Learning checks

Tiny Notes includes two authored checks. One asks which operation the CLI and
HTTP share. The other asks what the service test expects after adding tags
with different case and spacing. Each check works without a model connection.

The player offers a check when Read or Listen naturally reaches a chapter end
with an authored check. Use **Learning check** on that beat to open it on demand,
or turn off **Automatic learning checks**. A seek or manual beat change leaves
the learner in control. **Code hint** shows the cited excerpt and can open the
full file in another tab. **Show explanation** reveals the authored answer.

Typed answers stay in the open check and are discarded on close or reload.
**Try again** clears the answer. **Skip** or **Continue** resumes active playback
or leaves it paused if the learner opened the check while exploring.

During authoring, validate check text and anchor references together. The
review editor can update or remove authored checks. Record learner observations
as review comments when evaluating whether a check helped a first-time learner
find the cited module or explain the feature. Review exports include the
authored evidence and those comments.

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
