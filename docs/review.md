# Human Review

A generated tour can be reviewed before it is published. A review session is a
human pass over one tour revision: comments, beat edits, regeneration, anchor
re-verification, and an approve or reject decision.

## State machine

```
draft ──► in_review ──► approved
              │  ▲          │
              │  └──────────┘  (an edit after approval reopens the review)
              └──► rejected
```

- `POST /api/reviews` starts a review; the same tour revision returns the
  existing session instead of a new round.
- Approval is blocked while any anchor is `mismatch`, `missing`, or
  `unreadable`, with the anchor ids in the error details.
- Rejection requires a reason.
- An edit or regeneration after approval returns the session to `in_review`.

## Review session

A session records the tour document hash, the reviewer (`local` by default; a
GitHub login when signed in), timestamps, per-beat and tour comments, beat
edits, regeneration records, anchor checks, and the decision. A session bound to
a named reviewer refuses other actors.

## Editing and regeneration

- Beat editing covers title, narration, suggested questions, and diagram focus.
  Validation runs on save; manual narration edits get the 30–180 word bound as a
  warning.
- Regeneration uses the beat's anchors and context with the active authoring
  model. The generated draft must keep the beat's anchors exactly, stay inside
  the chapter diagram, and meet the word bound. The previous narration is stored
  so the reviewer can diff, revert, or compare.
- A regeneration can be reverted through
  `POST /api/reviews/:id/regenerations/:regenerationId/revert`.

## Anchor gate

With a project root configured, the live source is authoritative: each anchor is
`verified`, `mismatch`, `missing`, or `unreadable`. Without a root, the embedded
excerpts are verified and reported as the weaker check. Approval records the
check set; a quality override (approving over reported issues) is recorded as
`qualityOverride: true`.

## API

| Method | Route                                                   |
| ------ | ------------------------------------------------------- |
| POST   | `/api/reviews`                                          |
| GET    | `/api/reviews/:id`                                      |
| POST   | `/api/reviews/:id/comments`                             |
| PUT    | `/api/reviews/:id/beats/:beatId`                        |
| POST   | `/api/reviews/:id/beats/:beatId/regenerate`             |
| POST   | `/api/reviews/:id/regenerations/:regenerationId/revert` |
| POST   | `/api/reviews/:id/decide`                               |
| GET    | `/api/reviews/:id/export`                               |

## UI

`/review/$tourId` shows the outline, the beat reader (narration, code anchor,
diagram), and the review panel (quality, comments, decision). Edit mode is
inline with validation; regeneration shows a word diff with revert; the decision
actions are keyboard reachable (`r` focuses the rejection reason, `a` approves).
Reading, editing, and decision states all pass the axe gate.

## CLI

```bash
sothspell review list
sothspell review show <reviewId>
sothspell review approve <reviewId>
sothspell review reject <reviewId> --reason "<text>"
```

## Audit and export

The review record is the audit trail: reviewer, timestamps, comments, edits,
regenerations, anchor checks, and the decision. `GET /api/reviews/:id/export`
returns a Markdown/JSON report.

## Limits

- Reviewer identity is `local` until accounts are signed in; multi-reviewer
  roles and assignments are future work.
- Regeneration needs a configured authoring model; without one it returns 503
  and the rest of the review still works.
- The editor is beat-scoped; structural changes (add/remove beats or chapters)
  are future work.
