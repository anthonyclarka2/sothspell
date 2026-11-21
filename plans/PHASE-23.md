# Phase 23 — Reader access, first-run demo, and learning checks

**Status: in progress (2026-11-20).** Depends on Phase 22. GitHub tracks
[#7](https://github.com/anthonyclarka2/sothspell/issues/7),
[#8](https://github.com/anthonyclarka2/sothspell/issues/8),
[#9](https://github.com/anthonyclarka2/sothspell/issues/9), and
[#10](https://github.com/anthonyclarka2/sothspell/issues/10).

## Goal

Give new learners a small, inspectable project. Provide a linear way to read
the walkthrough and its evidence. Let the guide ask optional questions grounded
in that evidence. Review the shipped paths for correctness and regression risk.

## Waves and seams

| Wave          | Scope                                                                                    | Public test seams                                                               |
| ------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Audit         | Inventory shipped surfaces, record baseline, fix verified regressions, assign follow-ups | Hono tour route before and after replacing an artifact                          |
| Demo          | Make Tiny Notes the built-in first-run tour and retain historical Bunbun links           | Tour and source routes, then browser home → beat → code → return                |
| Accessibility | Provide a linear reader path and address focus, keyboard and equivalent evidence         | Web navigation and player with keyboard, magnification and assistive technology |
| Learning      | Optional chapter-end checks with explanations tied to existing code anchors              | Authoring model/validation, compiler and player pause/reveal/continue           |

## Decisions

- Keep the Bunbun checkout read-only and its golden tour pinned to `9fef24d`.
- A local project stays read-only across analysis, authoring and playback.
- The first-run demo and any authored learning check play without provider keys.
- Player views preserve the tour and beat through navigation to evidence.
- Learning responses are private and ephemeral. The first version uses feedback
  grounded in the authored explanation and avoids grades.
- Use WCAG 2.2 AA criteria and record manual VoiceOver and NVDA evidence before
  making a conformance claim.

## Implemented decisions and verification

- The default demo has six beats across three chapters and runs for 3 minutes
  42 seconds. Its source, line ranges and diagram relations are pinned and
  verified. The browser test follows the source and returns to the same beat
  with an empty home and no model credentials.
- Canvas remains the default view. The URL preserves Stage or Reading view
  across beats and source navigation. See the
  [manual accessibility matrix](../docs/accessibility.md).
- The audit identified a stale source compile and a failed-read recovery bug.
  Both are fixed. Independent project identity remains tracked in
  [#11](https://github.com/anthonyclarka2/sothspell/issues/11).

## Exit criteria

Run the repository gate with local servers and record environment and skips.
Verify stale-tour recovery, a clean-home demo journey, the accessibility matrix,
and provider-free learning checks. Review tracked follow-ups by user impact.
See [the audit record](../docs/audit-2026-11-20.md) for the baseline and evidence.
