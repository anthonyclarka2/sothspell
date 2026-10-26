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
- the listen and ask player states;
- the canvas board, relation containers, outline, shortcut sheet, display
  menu, compact layout, preference modes, auto-arrange notice, export menu, and
  print sheet.

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

### Canvas

| Key       | Action                                          |
| --------- | ----------------------------------------------- |
| Arrows    | Move selection between cards/objects            |
| `H/J/K/L` | Move left/down/up/right                         |
| `Enter`   | Enter a container or activate the item          |
| `Escape`  | Item → container → home; exits fullscreen first |
| `Shift+H` | Home diagram                                    |
| `Shift+A` | Auto-arrange                                    |
| `0` / `1` | Fit all / reset zoom                            |
| `F`       | Fullscreen                                      |
| `?`       | Shortcut sheet                                  |

The board is one tab stop with roving focus. The outline is the text
equivalent, and a polite live region announces selection, relation loads, fit,
fullscreen, notices, and preference changes. High contrast, increased contrast,
forced colours, the colour-blind palette, and 200% text are supported. See
[`canvas.md`](./canvas.md#accessibility).

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

- Manual VoiceOver and NVDA sessions have not been recorded. Automated axe and
  keyboard/browser tests are green; VoiceOver is the next manual gate, and NVDA
  remains owner-gated on Windows.
- Diagram text alternatives are present as accessible node/message labels and a
  canvas outline, not a full long-description editor.
- The a11y matrix is a representative set, not every possible beat or relation
  state.
- Firefox and WebKit are not in the canvas browser matrix.
