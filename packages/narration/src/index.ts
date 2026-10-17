export type {
  CharacterAlignment,
  NarrationAssetRecord,
  NarrationAssetStore,
  NarrationAudio,
  NarrationProvider,
  NarrationSegment,
  NarrationSynthesisRequest,
  NarrationSynthesisResult,
  SentenceTiming,
  TimedSpan,
  WordTiming,
} from './types.js';

export { splitSentences } from './sentences.js';
export type { Sentence } from './sentences.js';

export { normalizeAlignment } from './alignment.js';
export type { NormalizedAlignment } from './alignment.js';

export { createBrowserNarration } from './browser.js';
export type {
  BrowserNarration,
  BrowserNarrationOptions,
  BrowserNarrationSnapshot,
  BrowserNarrationStatus,
  BrowserSpeechEvent,
  BrowserUtterance,
} from './browser.js';

export { estimateDurationMs, narrationContentHash } from './content.js';

export { synthesizeElevenLabs } from './elevenlabs.js';
export type { ElevenLabsSynthesis, SynthesizeElevenLabsOptions } from './elevenlabs.js';

export { createFileNarrationStore } from './store.js';
