---
name: sothspell
description: Generate, open, or ask about a sóþspell walkthrough of this project. Use when the user asks for a guided explanation of the codebase, a project walkthrough, or a question about the current tour beat.
argument-hint: '[status|generate|open|ask <question>]'
---

# Sóþspell

Sóþspell authors a cinematic, semi-interactive walkthrough of this project:
chapters, beats, code anchors, diagrams, and narration. Generation is a local,
read-only analysis. It never writes to the project; tours and runs live under
`SOTHSPELL_HOME` (default `~/.sothspell`). The browser player is the theater —
the terminal only launches it and reports status.

Run the bundled command with the Bash tool:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/sothspell.sh" status
"${CLAUDE_PLUGIN_ROOT}/scripts/sothspell.sh" generate
"${CLAUDE_PLUGIN_ROOT}/scripts/sothspell.sh" open
"${CLAUDE_PLUGIN_ROOT}/scripts/sothspell.sh" ask "How does a request flow through the project?"
```

## Verbs

- `open` (default) — open the existing tour, or generate one first.
- `status` — show the tour, saved run progress, and player URL.
- `generate` — author a new tour even when one exists.
- `ask <question>` — ask the guide about the current beat; answers cite code.

## Player

The player is the single `sothspell serve` process. If a command reports that
the player is not reachable, tell the user to start it with
`pnpm sothspell serve` and open the printed deep link. Never start a second
server and never open the raw `tour.json`; the browser player renders diagrams,
code highlighting, and narration.
