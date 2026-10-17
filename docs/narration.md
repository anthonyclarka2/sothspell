# Narration

Narration is optional. Every beat is readable on its own; Listen mode adds speech
and synchronized highlighting without replacing the text.

## Adapters

### Browser speech

The browser adapter splits narration into sentences and speaks one utterance per
sentence. This is deliberate: browser pause/resume and boundary events are
inconsistent, so a sentence is the smallest reliable unit.

- Default voice source; no API key.
- Sentence highlight driven by `onSentence`.
- Word boundaries are mapped to absolute text offsets when the browser emits
  them.
- Pause cancels the current utterance; resume replays the current sentence.
- Unsupported browsers show a readable error and leave read mode intact.

### Cloud speech

Cloud narration uses ElevenLabs `text-to-speech/{voice_id}/with-timestamps`:

- Returns MP3 audio plus character-level timings.
- The API normalizes characters to sentence and word timings.
- Assets are content-addressed by text + voice + model + output format and
  stored under `$SOTHSPELL_HOME/audio`.
- `GET /api/audio/:hash` serves full and range responses for seeking.
- A cache hit is playable without a provider key; only a miss needs the key.
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, and optional
  `ELEVENLABS_MODEL_ID` configure the provider.

Cloud is opt-in in the player. If it fails, the player reports the error and
falls back to browser speech.

## Synchronization

- Listen mode pauses the read clock and starts narration for the current beat.
- Narration progress updates the player offset; narration end advances to the
  next beat.
- The active sentence is highlighted in the narration rail.
- Cloud word timings drive the active word; browser narration provides
  sentence-level highlighting.
- Pause/resume is handled by the active adapter.
- The transport reflects narration state in Listen mode.

## Privacy and caching

- Browser speech keeps narration text in the browser.
- Cloud narration sends the beat text to ElevenLabs. The UI discloses this by
  making cloud a deliberate choice.
- Cached audio stays under `SOTHSPELL_HOME`; the API never writes to the project.
- Provider keys are server-side environment values and never reach the browser.

## Accessibility

The axe gate covers read, listen, and ask states at 0 critical / 0 serious.
Narration mode is keyboard-reachable, the active sentence is announced through
the status text, and read mode remains complete when speech is unavailable.

## Owner-gated

A live ElevenLabs round trip was not run because no provider key/voice is present
in this environment. The adapter, retry behavior, normalization, cache, range
serving, and browser fallback are covered by unit tests and the Playwright
listen/pause journey with an injected speech implementation.
