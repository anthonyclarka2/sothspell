# Accessibility

Accessibility is a release gate, not a follow-up pass.

## Gate

```bash
pnpm test:a11y
```

The Playwright `a11y` project runs axe-core with WCAG 2.2 A/AA tags on:

- the home page;
- the player in its initial state;
- the full-file code browser;
- the listen and ask player states.

The threshold is **0 critical / 0 serious violations**. Moderate/minor findings
are recorded as advisory.

## Keyboard

| Key                           | Action                                           |
| ----------------------------- | ------------------------------------------------ |
| Space                         | Play/pause (read or listen)                      |
| Left/Right                    | Previous/next beat                               |
| Shift+Left/Right              | Seek 5 seconds                                   |
| T                             | Theater mode                                     |
| Escape                        | Exit theater mode                                |
| Tab                           | Controls, chapters, diagram nodes, code viewport |
| Enter/Space on a diagram node | Open its code anchor                             |

The code viewport is focusable so the virtualized source can be scrolled without
a mouse. Diagram nodes expose their visible label and type in the accessible
name.

## Reading and narration

- Text is always present; narration never replaces the beat.
- Read mode auto-advances without audio.
- Listen mode highlights the active sentence; cloud narration also tracks words.
- Pause/resume works at sentence granularity for browser speech and at audio
  precision for cloud narration.
- Unsupported speech falls back to a readable error and read mode.

## Memory and motion

- The player has no perpetual animation.
- Diagram transitions are focus changes, not layout churn.
- Reduced-motion handling is applied to interface transitions; no content depends
  on motion.

## Known gaps

- No dedicated screen-reader session has been recorded by a human reviewer yet.
- Diagram text alternatives are present as accessible node/message labels, not a
  full long-description editor.
- The a11y matrix is a representative set, not every possible beat state.
