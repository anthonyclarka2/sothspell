# Player and Code Browser

The web player turns a compiled Sóþspell into a controllable, auto-advancing
walkthrough. It is read-only and works without narration; narration arrives in
Phase 5.

## Playback

The player has three modes:

- **Read** — text and diagrams, auto-advancing at each beat's duration.
- **Explore** — paused; the user controls chapters, beats, code, and diagrams.
- **Listen** — reserved for Phase 5.

Controls:

- Play/pause (or Space).
- Previous/next beat (or Left/Right).
- Seek 5 seconds (Shift+Left/Right).
- Scrubber across the whole tour; seeking pauses.
- Speed 0.5×–2×.
- Theater mode (`t` toggles, Escape exits).

Explicit interactions pause: opening code from a beat or a diagram node, or
scrubbing. Resume returns to the saved offset.

## Keyboard map

| Key              | Action                                             |
| ---------------- | -------------------------------------------------- |
| Space            | Play/pause                                         |
| Left/Right       | Previous/next beat                                 |
| Shift+Left/Right | Seek 5 seconds                                     |
| T                | Toggle theater mode                                |
| Escape           | Exit theater mode                                  |
| Tab              | Move through controls, chapters, and diagram nodes |

Diagram nodes are buttons: Enter or Space opens their code anchor. React Flow
keeps pan and zoom on its own controls so the page never hijacks scrolling.

## Code browser

The code page is a read-only evidence view:

- a virtualized full file (`@tanstack/react-virtual`) with line numbers;
- the anchor range marked with a left rule and scrolled into view;
- an outline of every tour anchor in that file;
- a fresh or stale badge from the anchor hash comparison;
- a link back to the originating beat.

Files are read only from the configured project root
(`SOTHSPELL_PROJECT_ROOT`). If no live root is configured, the page falls back
to the embedded golden excerpt. The browser never writes to the project.

## Progress

Runs are local-first:

- IndexedDB is written immediately on beat changes, pause, and speed changes.
- The API mirrors the run in a local SQLite table keyed by an anonymous
  client-generated id.
- A reload or server restart resumes the newer of the local and server copies
  and unions the completed beats.

Completed beats appear with a check in the chapter rail. A completed tour clears
the run.

## Responsive and accessible

- Player controls, chapter rail, stage, and narration fit the viewport at
  desktop; the page scrolls on mobile and hides the chapter rail below 1080 px.
- All controls are keyboard reachable; the code viewport is focusable; diagram
  nodes expose their anchors as buttons.
- The axe gate runs on the home, player, and code-browser pages at 0 critical /
  0 serious.

## Not in this phase

- Audio narration, captions, and word-level highlighting (Phase 5).
- Q&A interludes and drilldown (Phase 6).
- Run export/import and accounts (Phase 6).
- OpenCode plugin playback (Phase 7).
