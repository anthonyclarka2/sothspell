# Accessibility

The evaluation target is WCAG 2.2 Level AA for complete journeys in the web app
and the shipped embed. Issue 7 stays open for manual testing and criterion-level
sign-off. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) ·
[W3C evaluation methodology](https://www.w3.org/WAI/test-evaluate/conformance/wcag-em/)

## Gate

```bash
pnpm test:a11y
```

The web gate runs axe-core with the supported WCAG A and AA tags from WCAG
2.0, 2.1 and 2.2. A reported violation at any impact fails the check. The
expanded gate found three closely spaced appearance checkboxes. Each input now
measures 24 × 24 CSS pixels.

| Journey              | Automated sample                                                                                                     | Manual coverage still required                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Browse and author    | Home, local and public GitHub authoring, import, fixture success and failure                                         | Real repository selection, recovery, progress feedback, and entry into the resulting tour |
| Play a beat          | Canvas, Outline, Stage, Reading view, chapter navigation, fullscreen and compact layouts                             | Screen reader, keyboard and magnification through an entire tour                          |
| Trace evidence       | Directed edge with an authored label, object without code, paged source, cited range and return to beat              | Spoken order, line numbers, citation and focus after return                               |
| Read, Listen and Ask | Browser speech with a test voice, pause/resume, translated and fallback captions, interlude and citations            | Actual synthesizer output, overlapping speech, asynchronous announcements                 |
| Configure and review | Settings empty/filled/error, signed-in account, sync and error fixtures, review reading, editing and decision states | Sign-in and recovery, sync conflicts and destructive actions using AT                     |
| Export and embed     | Export menu, print-sheet DOM, static custom element and iframe, desktop and mobile emulation                         | Host-page integration, real touch and accessible reading order in a saved document        |

The generated PDF and exported raster image are outside the web-page assessment.
The print control and print-sheet DOM are in scope. Actual Save-as-PDF, tagging,
reading order and document accessibility require separate inspection.

## Keyboard

| Key                           | Action                                           |
| ----------------------------- | ------------------------------------------------ |
| Space                         | Play/pause (read or listen)                      |
| Left/Right                    | Previous/next beat                               |
| Shift+Left/Right              | Seek 5 seconds                                   |
| T                             | Theater mode                                     |
| F                             | Fullscreen (canvas view)                         |
| Escape                        | Close overlay → step out → fullscreen → theater  |
| Tab                           | Controls, chapters, diagram nodes, code viewport |
| Enter/Space on a diagram node | Open its code anchor                             |

The first Tab stop is **Skip to content**. The player leaves Ctrl/Command+F
to the browser. Uncheck **Single-character shortcuts** beside the view switch
to disable letter, digit and punctuation shortcuts for this browser. Named
buttons, Tab and the arrow keys remain available.

The code viewport is focusable so the virtualized source can be scrolled without
a mouse. Diagram nodes expose their visible label and type in the accessible
name.

### Canvas

| Key       | Action                                         |
| --------- | ---------------------------------------------- |
| Arrows    | Move selection between cards/objects           |
| `H/J/K/L` | Move left/down/up/right                        |
| `Enter`   | Enter a container or activate the item         |
| `Escape`  | Overlay → item → container → home → fullscreen |
| `Shift+H` | Home diagram                                   |
| `Shift+A` | Auto-arrange                                   |
| `0` / `1` | Fit all / reset zoom                           |
| `F`       | Fullscreen                                     |
| `?`       | Shortcut sheet                                 |

The board is one tab stop with roving focus. The outline is the text
equivalent, and a polite live region announces selection, relation loads, fit,
fullscreen, notices, and preference changes. Below 1081 px the **Chapters**
disclosure opens the same chapter rail; Escape closes it before fullscreen.
High contrast, increased contrast, forced colours, the colour-blind palette, and
200% text are supported. See
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

## Reading view and source

Choose **Reading view** beside Canvas and Stage. The URL keeps the choice
through reloads, beat changes and a source round trip. Diagrams list each
source, relation, destination and authored label in order. A diagram object
without a code anchor still supports selection. **Open code page** opens up to
100 numbered lines at a time in Reading view. **Next lines**, **Previous
lines** and **Return to cited lines** are available without scrolling a
virtual viewport. The same option is available from any code page under
**Read source in pages**. Narration text and speech use the compiled tour’s
content language when the shell uses another language.

In Canvas, open **Show outline** and expand **Adjust** under a card to enter
its horizontal and vertical positions. Code containers also expose width and
height. Apply the placement with Enter or a single click or tap. The shortcuts
dialog cycles through its enabled controls and returns focus to the opener
after dismissal at desktop and compact widths.

## Browser and assistive technology matrix

| Platform     | Environment                                 | Evidence                                                                                                                                                                                              |
| ------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS 26.7.1 | Chrome 158.0.8127.36, Playwright 1.64.1     | Browser keyboard journeys, focus assertions, axe checks, 375 px compact and 320 CSS px Reading view with increased text spacing, reduced motion and forced colours. Canvas text scale tested at 200%. |
| macOS        | Playwright Firefox 157.0, production bundle | Independent keyboard smoke at 320 CSS px. Directed relation visible. Enter opened paged Source lines and Back returned to the same beat in Reading view.                                              |
| macOS 26.7.1 | Safari 27.0 and VoiceOver 10 installed      | Manual session pending. No spoken-output recording.                                                                                                                                                   |
| Windows      | NVDA with Firefox or Chrome                 | No Windows AT host used. Record OS, browser and NVDA versions during the manual session.                                                                                                              |
| Mobile       | Chrome mobile emulation                     | Compact web and embed checks. Real touch, VoiceOver on iOS and TalkBack remain untested.                                                                                                              |

## Manual evaluation journeys

Run these journeys separately with VoiceOver/Safari and NVDA/Firefox or
Chrome. Record the build revision, OS/browser/AT versions, input method and
viewport. For each step capture the focused control, actual spoken output,
expected content and any blocked task. Preserve the beat URL with each finding.

1. Open the home page. Use the skip link, then headings and landmarks. Open
   **New tour**, enter a local repository or public GitHub URL and author a
   tour. Repeat with an invalid repository and recover. Check the progress
   announcement, result and focus when the tour opens.
2. Open the Bunbun golden tour, choose Reading view and read the first beat.
   Trace “ATProto PDS writes Local index (reconcile)”. Select Web islands,
   then an object with evidence. Open its source, read the cited line, move to
   another page and return to the citation. Activate **Back to the beat**.
   Record the beat, reading position, language and spoken relation.
3. Visit Stage and Canvas. Operate the chapter drawer, Outline, size and
   position controls, shortcuts dialog and fullscreen. Reach every enabled
   dialog action in both directions and dismiss with Escape. Verify focus and
   reading order after each dismissal. Disable single-character shortcuts
   and use native Find and screen-reader navigation.
4. Switch from Read to Listen. Pause and resume with Space and with the
   transport. Open Ask, follow a citation, resume and finish the tour.
   Compare an available translation with source-language fallback.
5. Configure a profile, sign in, sync, recover from an error and review a
   beat. Verify required fields, validation messages, help, destructive-action
   confirmation and focus after save. Check the embed inside a host page and
   iframe, and return to host content. Open export and print controls.
6. Repeat critical actions at 200% browser zoom and text enlargement, with
   WCAG text spacing, at 320 and 375 CSS px, in forced colours and with
   reduced motion. Check clipping, contrast, obscured focus and pointer
   targets. Record any content that requires two-dimensional scrolling.

## Criterion status

The rows group criteria that need the same evidence. “Sampled” records a
specific test in this release. Every row remains open for whole-journey
assessment. Record pass, fail or an applicability rationale for each criterion
and route before making a conformance claim.

| WCAG 2.2 criteria                 | Evidence and outstanding assessment                                                                                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1, 1.3.1–1.3.3                | Sampled directed diagrams, source lines, selection and headings. Verify meaningful nonvisual alternatives, structure, sequence and sensory instructions with AT.                                      |
| 1.2.1–1.2.5, 1.4.2                | Narration text and pause controls sampled. Inventory each media type, identify text alternatives and test audio control on all hosts. Determine applicability of live and prerecorded video criteria. |
| 1.3.4, 1.3.5                      | Responsive widths sampled. Verify both orientations and programmatic purpose of fields that collect user data.                                                                                        |
| 1.4.1, 1.4.3–1.4.5, 1.4.10–1.4.13 | Sampled axe contrast, canvas text scaling, 320 CSS px reflow, text spacing and forced colours. Inspect colour-only signals, all visual states, text images, hover/focus content and browser zoom.     |
| 2.1.1, 2.1.2, 2.1.4               | Dialog traversal, Escape, native Find event handling, shortcuts opt-out and keyboard source return sampled. Check complete journeys with each AT’s commands.                                          |
| 2.2.1, 2.2.2, 2.3.1               | Pause controls and reduced motion sampled. Audit timing limits, animation, automatically updated content and flashing in every view and the embed.                                                    |
| 2.4.1–2.4.7, 2.4.11               | Skip link, route titles, reading order, active focus, chapter navigation and dismissal sampled. Inspect contextual link purpose, labels, ways of finding pages, focus visibility and obstruction.     |
| 2.5.1–2.5.4, 2.5.7, 2.5.8         | Numeric move/resize and target-size axe rules sampled. Verify real-device gestures, pointer cancellation, accessible names, motion alternatives and spacing.                                          |
| 3.1.1, 3.1.2                      | Shell and narration language sampled with rendered translations and fallback. Check remaining multilingual content, code and AT pronunciation.                                                        |
| 3.2.1–3.2.4, 3.2.6                | Sampled view changes and explicit controls. Inspect focus/input behavior, consistent navigation, identification and help placement.                                                                   |
| 3.3.1–3.3.4, 3.3.7, 3.3.8         | Settings and account errors sampled with fixtures. Verify real sign-in, data entry, error correction, redundant entry and prevention of unintended data loss.                                         |
| 4.1.2, 4.1.3                      | Automated name/role checks, selected state and live-region changes sampled. Confirm actual name, value, timing and spoken feedback across both AT stacks.                                             |
