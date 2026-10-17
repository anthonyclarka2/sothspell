# Phase 5 — Narration & Accessibility

**Status: planned.** Depends on: Phase 4 (player timing and code browser).

**Deliverable:** two narration adapters at launch — browser speech (default) and
cached ElevenLabs cloud narration — synchronized with text and diagrams, plus a
hard accessibility gate of 0 critical / 0 serious axe violations on every player
and code-browser state.

## Goal

Make the “speech and text and diagrams” mode real without making any of the other
modes worse. A user with no API key gets a narrated tour through the browser. A
user with a key gets a higher-quality voice with word-level alignment and cached
audio. A user who cannot or does not want audio gets the same tour in text mode.

## Why this order

- Audio is a timing feature; it depends on the Phase 4 playback engine.
- The player's visual surface must be stable before the full accessibility audit.
- Cloud audio has cost, privacy, and caching implications that deserve a
  dedicated phase.
- Accessibility is not a cleanup task at the end; it changes the player's
  structure.

## Scope

### In scope

- `NarrationSegment` and alignment model.
- Sentence splitting and text normalization.
- Browser SpeechSynthesis adapter with sentence-level pause/resume.
- ElevenLabs adapter with character timestamps, word/sentence alignment, MP3
  caching, and HTTP range serving.
- Voice and model settings.
- Audio/text synchronization: active sentence, active word, captions,
  auto-advance.
- Playback controls: voice toggle, mute, speed, replay beat, skip.
- Accessibility audit and fixes.
- Keyboard and screen-reader behavior.
- Reduced motion, contrast, focus, and captions.
- Bunbun narrated tour acceptance.

### Out of scope

- Voice cloning, multiple hosts, or conversational audio.
- Real-time streaming TTS.
- Other cloud TTS providers (the adapter seam is ready).
- Automatic translation or multi-language narration.
- Audio export as a podcast.

## Decisions

1. **Both adapters ship.** Browser narration is the default and requires no key.
   Cloud narration is an explicit opt-in with a provider key and voice.
2. **Sentence-level browser narration.** The narration is split into sentences;
   each sentence is one utterance. Pause stops the current utterance and resume
   starts the current sentence from the beginning if the browser cannot resume
   mid-utterance. This is predictable across browsers.
3. **Character timings become word timings.** ElevenLabs returns character
   alignment; the adapter maps characters to word boundaries and stores both.
   The player uses word timings for captions and highlighting.
4. **Audio is content-addressed and cached.** Key = SHA-256 of text + voice ID +
   model ID + output format. The same beat never pays twice on the same machine.
5. **Cloud narration is opt-in and disclosed.** The first cloud generation shows
   what text leaves the machine and to whom. No audio is generated in the
   background without consent.
6. **Text is always visible.** Narration never replaces the beat text; it
   highlights it. Captions can be turned off, but the narration rail remains.
7. **Accessibility is a release gate.** 0 critical / 0 serious axe violations; a
   keyboard-only pass; screen-reader checks on the main journey.
8. **Auto-advance must be controllable.** A global “pause after each beat” setting
   and a visible pause control. Audio does not autoplay before a user gesture.

## Waves

### Wave 0 — Narration model and text preparation

1. Define:
   ```ts
   interface NarrationSegment {
     beatId: string;
     text: string;
     sentences: SentenceTiming[];
     words: WordTiming[];
     audio?: { path: string; durationMs: number; mimeType: string };
     provider: "browser" | "elevenlabs";
     voiceId: string;
     modelId?: string;
     contentHash: string;
   }
   ```
2. Sentence splitting:
   - handle abbreviations, code identifiers, and punctuation;
   - keep the original text offsets so the UI can highlight the exact range;
   - test with code-heavy narration (`CommentsService.create`, `ATProto`).
3. Text normalization:
   - pronounce identifiers naturally (“CommentsService dot create”) without
     changing the displayed text;
   - preserve code spans;
   - configurable pronunciation dictionary later.
4. Tests: sentence boundaries, offsets, code identifiers, empty text, long text.

### Wave 1 — Browser adapter

1. `BrowserNarrationAdapter`:
   - feature-detect `speechSynthesis`;
   - select a voice by language and preference;
   - speak sentence by sentence;
   - track `onboundary` charIndex;
   - pause/resume/cancel;
   - rate and pitch controls;
   - timeout and error handling.
2. Pause semantics:
   - pause cancels the current utterance after recording the sentence index and
     character offset;
   - resume restarts the current sentence (documented) or uses browser pause if
     the boundary is reliable;
   - never skip a sentence.
3. Autoplay policy:
   - the first play is a user gesture;
   - switching beats while playing continues;
   - if the browser blocks speech, show a clear “Tap play to start narration”
     state.
4. Tests with a fake `speechSynthesis`:
   - sentence order;
   - boundary events;
   - pause/resume;
   - cancel;
   - unsupported browser fallback.

### Wave 2 — ElevenLabs adapter

1. `ElevenLabsNarrationAdapter`:
   - official `@elevenlabs/elevenlabs-js` SDK; REST fallback;
   - `POST /v1/text-to-speech/{voice_id}/with-timestamps`;
   - request `mp3_44100_128` by default;
   - `enable_logging=false` when the account supports zero-retention;
   - store `audio_base64` as an MP3 and the alignment as JSON;
   - normalize character alignment to word and sentence timings;
   - retry with bounded backoff on 429/5xx;
   - never log the API key or full text.
2. Cache:
   - `$SOTHSPELL_HOME/projects/<projectId>/audio/<hash>.mp3`;
   - alignment JSON beside it;
   - metadata: provider, voice, model, text hash, duration, created date;
   - range requests for seeking.
3. Generation policy:
   - pre-generate a tour's audio on request (“Prepare narration”) or lazily on
     first play;
   - show progress per beat;
   - a failed beat falls back to browser narration or text;
   - cancellation stops further requests.
4. Cost:
   - estimate characters and show the provider's character count before
     generation;
   - per-run audio budget;
   - reuse cache across runs.
5. Tests with a fake HTTP server:
   - request shape;
   - alignment normalization;
   - cache hit/miss;
   - 429 retry;
   - range response;
   - API key redaction.

### Wave 3 — Synchronization and playback

1. Extend `packages/player` with a `NarrationPort`:
   ```ts
   interface NarrationPort {
     load(segment: NarrationSegment): Promise<void>;
     play(fromMs: number): Promise<void>;
     pause(): Promise<number>;
     seek(ms: number): Promise<void>;
     stop(): Promise<void>;
     currentTimeMs(): number;
     durationMs(): number | null;
   }
   ```
2. Audio clock:
   - when cloud audio is available, use `audio.currentTime` as the master clock;
   - when browser speech is active, use the boundary event plus an internal
     monotonic clock;
   - when read mode is active, use the fake-clock timer.
3. Text sync:
   - active sentence gets a visible highlight;
   - active word gets a subtle emphasis (not a bouncing karaoke effect);
   - captions show the current sentence;
   - clicking a sentence seeks the audio to that sentence.
4. Auto-advance:
   - listen mode advances on `ended`;
   - if audio fails, fall back to the beat's duration estimate and a warning;
   - pause freezes the clock and the text highlight.
5. Drift:
   - sample the audio clock and the rendered highlight every 250 ms;
   - if drift exceeds 150 ms, re-sync;
   - log a warning in development only.
6. Tests:
   - sync at sentence boundaries;
   - seek to a word;
   - pause/resume;
   - fallback from missing audio;
   - drift correction.

### Wave 4 — Accessibility

1. Run axe-core on every player state:
   - initial, playing, paused, asking, answer shown, completed, error;
   - code page with and without an anchor;
   - diagram, sequence, and text alternative;
   - settings and runs pages.
2. Fix all critical/serious violations; record moderate/minor findings and
   exceptions in `docs/accessibility.md`.
3. Keyboard:
   - Space play/pause; arrows previous/next; Shift+arrows seek;
   - Tab order: transport, narration, chapters, stage;
   - visible focus;
   - Esc closes dialogs and the code pane;
   - no keyboard trap in the diagram;
   - skip links.
4. Screen reader:
   - `role="status"` for playback state changes;
   - beat title and progress announced on change;
   - captions are not a live region that floods;
   - code highlight summary announced;
   - diagram text alternative.
5. Motion:
   - `prefers-reduced-motion` disables diagram transitions and stage fades;
   - no auto-playing motion beyond a progress indicator.
6. Contrast:
   - body text meets AA; large text meets AA;
   - focus ring meets 3:1 against adjacent colors;
   - captions meet AA over the stage.
7. Cognitive:
   - pause after each beat setting;
   - speed control;
   - text size control;
   - no time-limited interactions.

### Wave 5 — Bunbun acceptance and closure

1. Generate cloud narration for the golden Bunbun tour and cache it.
2. Play the tour end to end with browser narration and with cloud narration.
3. Verify:
   - every beat's text highlight follows the audio;
   - pause/resume returns to the same sentence/word;
   - captions match the narration;
   - code/diagram links work during playback;
   - no audio autoplay before a gesture;
   - a missing API key leaves browser narration available.
4. Run axe on all states; 0 critical/serious.
5. Run a keyboard-only pass; record evidence.
6. Record audio cache size and generation cost for the golden tour.
7. Update `docs/narration.md` and `docs/accessibility.md`.

## Test seams

Confirm before the first test:

1. `synthesize(text, voice) → NarrationSegment` (narration).
2. `NarrationPort` (`load`, `play`, `pause`, `seek`, `stop`) (player).
3. `splitSentences(text) → Sentence[]` and `normalizeAlignment(...)`.
4. `GET /api/audio/:hash` range behavior.
5. Axe gate over the player state matrix.
6. Keyboard/screen-reader journey.

What they cover and miss:

- Narration adapters: catches request/alignment/cache behavior; misses voice
  quality and pronunciation.
- NarrationPort: catches sync and fallback; misses provider-specific quirks.
- Split/alignment: catches offsets; misses language-specific edge cases.
- Audio route: catches range/caching; misses CDN/proxy behavior.
- Axe/keyboard: catches structural accessibility; misses the lived experience of
  screen-reader users, which needs a manual review.

## Exit criteria (measurable)

1. Browser narration plays every beat in the golden tour without an API key.
2. Cloud narration plays the same tour with word-level highlight; audio is cached
   and a second play makes zero provider requests.
3. Pause/resume returns to the same sentence (browser) or within 150 ms (cloud).
4. Text remains visible and readable with narration off.
5. No audio starts before a user gesture.
6. Axe: 0 critical / 0 serious across the player and code-browser state matrix.
7. Keyboard-only: complete the main journey (play, pause, next, open code,
   return, ask, resume) without a mouse.
8. Screen-reader checks documented for the main journey; any known gaps listed.
9. `prefers-reduced-motion` disables stage/diagram transitions.
10. Audio cache size and generation cost for the golden tour recorded.
11. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:browser`, and
    `pnpm test:a11y` are green.

## Risks and mitigations

- **Browser speech inconsistency.** Sentence-level chunks and a documented
  restart-on-resume behavior; cloud audio is the precise path.
- **Cloud cost.** Cache by content hash; estimate before generation; per-run
  budget; opt-in.
- **Alignment normalization.** Character timings can include normalized text;
  keep both raw and normalized offsets and test with code identifiers.
- **Accessibility regressions.** The axe gate is checked in and runs in CI; the
  state matrix is part of the test manifest.
- **Autoplay blocking.** Treat the first play as a gesture; show a clear start
  state.
- **Privacy.** Disclose cloud text transfer; redact secrets before synthesis;
  never send code content that is not already in the tour narration.

## Working style

- Implement browser narration first; the cloud adapter must not be required for
  tests.
- Use fake audio/browser APIs in unit tests; use real Chrome in Playwright.
- Use `tdd` for alignment and sync; use the `design-taste-frontend` accessibility
  guardrails for the UI pass.
- Record the audio cache and cost numbers in the phase closure note.
