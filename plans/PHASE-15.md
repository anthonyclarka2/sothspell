# Phase 15 — Human Review UI

**Status: in progress (2026-10-17).** Depends on: Phase 9 (profiles) and the v1 authoring and
quality reports. Can run in parallel with Phases 10–12 after Phase 9.

## Goal

Turn a generated tour into a reviewable artifact. A human can read it, comment
per beat, edit narration, regenerate a beat, re-validate anchors, and approve or
reject it — with a recorded decision.

## Scope

### In

- A review state machine: `draft` → `in_review` → `approved` | `rejected`;
  edits after approval return the tour to `in_review`.
- A `ReviewSession` record: reviewer, timestamps, comments, decisions, and the
  tour revision reviewed.
- A `/review/:tourId` route: tour outline, beat reader, code anchors, diagram,
  quality report, comment thread, and an edit panel.
- Beat editing: title, narration, suggested questions, diagram focus; validation
  on save.
- Beat regeneration: regenerate one beat from its anchors and context without
  rewriting the rest of the tour.
- Anchor re-validation before approval: every anchor hash matches or is flagged
  stale with a reason.
- Approve/reject with a required reason on rejection.
- Review records stored in SQLite; export of a review report.
- A `sothspell review` CLI surface: `status`, `list`, `approve`, `reject`.
- Accessibility: keyboard-first review, screen-reader comments, axe gate.

### Out

- A full document editor, version control UI, or merge tool.
- Multi-reviewer workflows, assignments, or approvals by role (accounts can add
  this later).
- Inline comments on code lines.
- Publishing or deployment of approved tours.

## Decisions

1. **Review is per tour, comments are per beat.** One review session per tour
   revision; comments attach to a beat or to the tour as a whole.
2. **Editing is beat-scoped.** The editor changes one beat and validates it
   against the chapter plan, anchors, and schema. Structural changes (add or
   remove beats, chapters) are a future editor.
3. **Regeneration is explicit and reversible.** Regenerating a beat stores the
   previous narration in the review record so a reviewer can compare or revert.
4. **Approval requires fresh anchor verification.** A stale or missing anchor
   blocks approval with a named reason.
5. **The review record is the audit trail.** It stores who reviewed, when, the
   tour revision, the decision, and the comments. It never stores provider
   secrets.
6. **No account required.** A local reviewer is recorded as `local`; Phase 12
   accounts replace that with a GitHub login when signed in.
7. **The quality report is input, not a gate.** Reviewers see the report and can
   override it, but approval records that the override happened.

## Waves

### Wave 1 — Review domain

- `ReviewSession`, `ReviewComment`, `ReviewDecision` schemas; state machine with
  transitions and guards.
- `ReviewStore` in SQLite: create, load, append comment, update beat, decide,
  export.
- Tests: transitions, guard failures (approve with stale anchor, reject without
  reason), comment ordering, export shape, revision pinning.

### Wave 2 — Review API

- `POST /api/reviews` (start), `GET /api/reviews/:id`,
  `POST /api/reviews/:id/comments`, `PUT /api/reviews/:id/beats/:beatId`,
  `POST /api/reviews/:id/beats/:beatId/regenerate`,
  `POST /api/reviews/:id/decide`, `GET /api/reviews/:id/export`.
- Regeneration uses the authoring chapter/beat pipeline with the beat's anchors
  and the active authoring profile; the previous narration is stored.
- Anchor verification endpoint reused from the compiler.
- Tests: route contracts, regeneration with a fake model, stale-anchor blocking,
  permission mapping for local vs signed-in.

### Wave 3 — Review UI

- `/review/:tourId`: outline on the left, beat reader in the center (narration,
  code anchor, diagram), review panel on the right (quality, comments,
  approve/reject).
- Edit mode for the current beat with inline validation and save.
- Regenerate button with a diff of old vs new narration and a revert action.
- Keyboard shortcuts: next/previous beat, comment, edit, approve, reject; focus
  management and live regions for decisions.
- Playwright: start review, comment, edit, regenerate (fake model), approve,
  reject; axe on reading, editing, and decision states.

### Wave 4 — CLI, export, and docs

- `sothspell review list|show|approve|reject` against the local store.
- Review report export: Markdown/JSON with decisions, comments, and quality.
- `docs/review.md`: roles, state machine, regeneration behavior, and the audit
  record.
- Bunbun acceptance: review the fixture-generated Bunbun tour.

## Test seams

- `ReviewStore` and the state machine as pure domain functions.
- Review API with an injected store and a fake authoring model.
- Web review page with a mocked API.
- Compiler anchor verification reused as-is.

## Bunbun acceptance

1. Generate a Bunbun tour with the fixture model.
2. Start a review; add a comment; edit a narration sentence.
3. Regenerate one beat and revert it.
4. Approve the tour; verify the decision record and fresh anchors.
5. Confirm Bunbun is unchanged.

## Exit criteria

- A tour can be reviewed end to end: comment, edit, regenerate, approve or
  reject.
- Approval is blocked by stale or missing anchors with a named reason.
- Rejection requires a reason; edits after approval reopen the review.
- Review records persist and export.
- The review UI has a keyboard-only path and 0 critical/serious violations.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, browser tests, and
  axe pass.
- Bunbun remains read-only.

## Risks

- **Editor scope.** Editing can grow into a CMS. Keep it beat-scoped and
  validate against the existing plan and anchors.
- **Regeneration cost.** One beat is one model call; cache by context hash and
  show the diff before accepting.
- **Audit trust.** Local reviews have no identity. Record the client id and
  mark accounts as the stronger mode; do not overclaim.
- **Anchor staleness.** A project can change during review. Re-verify at
  approval and explain what changed.
- **Comment noise.** Keep threads per beat and collapse resolved comments.

## Working style

- Use `tdd` for the state machine and anchor gating.
- Use `codebase-design` for the review store seam; keep the domain free of Hono
  and React.
- Use the `design-taste-frontend` guardrails for the review surface.
- Record review terms and the state machine in `CONTEXT.md` and `docs/review.md`.
