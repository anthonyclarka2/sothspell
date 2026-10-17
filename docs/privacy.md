# Privacy

Sóþspell is local-first. The default path keeps source, snapshots, tours, and
runs on the machine.

## What stays local

- The repository and full source files.
- Analysis snapshots, symbol graphs, and the project brief.
- Tour documents, anchors, and diagram layouts.
- Browser speech (the text is spoken in the browser).
- Runs and progress (IndexedDB + local SQLite).
- API keys and provider configuration.

## What can leave the machine

Only when the user chooses it:

- **Authoring** sends the project brief, candidate anchor excerpts, and prompts
  to the configured model provider.
- **Cloud narration** sends the beat narration text to ElevenLabs. Audio is
  cached locally after generation.
- **In-tour questions** send the question, current beat context, and nearby
  excerpts to the configured model provider.

The UI exposes the cloud narration choice. Authoring and asking require a
configured model; they do not run silently.

## Protections

- Secret-like files are detected and excluded from analyzer context packs and
  authoring evidence.
- Redacted source is not stored in snapshots.
- Full-file reads are contained under `SOTHSPELL_PROJECT_ROOT`.
- Provider keys are server-side and never sent to the browser.
- No third-party analytics or hidden telemetry.
- Logs should not include prompts, source excerpts, or key material.

## User control

- Delete `SOTHSPELL_HOME` to remove local state.
- Delete a run in the player (start over/completion) to clear it.
- Use text-only mode without a TTS provider.
- Choose browser speech to avoid sending narration text to a cloud provider.

## Known limitations

- A model provider may retain prompts under its own policy; Sóþspell cannot
  guarantee provider retention behavior.
- Candidate excerpts are sent to the model; they are bounded but are still
  source code.
- The first release has no account or team boundary; it is a single-user local
  install.
