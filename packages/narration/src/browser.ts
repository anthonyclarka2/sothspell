import { splitSentences } from './sentences.js';

/**
 * Browser narration is sentence-level on purpose. Browsers disagree about
 * pausing mid-utterance and about boundary event reliability, so the adapter
 * gives each sentence its own utterance and restarts the current sentence on
 * resume. That behaviour is identical in every browser and easy to reason
 * about when the player synchronizes text to speech.
 */

export interface BrowserSpeechEvent {
  charIndex?: number;
  name?: string;
  error?: string;
}

/** The subset of `SpeechSynthesisUtterance` this adapter needs. */
export interface BrowserUtterance {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  voice?: unknown;
  onboundary?(event: BrowserSpeechEvent): void;
  onend?(): void;
  onerror?(event: BrowserSpeechEvent): void;
}

interface SpeechSynthesisLike {
  speak(utterance: BrowserUtterance): void;
  cancel(): void;
}

interface SpeechGlobals {
  speechSynthesis?: SpeechSynthesisLike;
  SpeechSynthesisUtterance?: new (text: string) => BrowserUtterance;
}

export type BrowserNarrationStatus =
  'idle' | 'speaking' | 'paused' | 'stopped' | 'completed' | 'error';

export interface BrowserNarrationSnapshot {
  status: BrowserNarrationStatus;
  /** Index into the sentence list, not a character offset. */
  sentenceIndex: number;
  error: string | null;
}

export interface BrowserNarrationOptions {
  text: string;
  rate?: number;
  pitch?: number;
  onSentence?: (index: number) => void;
  /** Receives the boundary character as an offset into the full narration text. */
  onWord?: (charIndex: number) => void;
  synthesize?: (utterance: BrowserUtterance) => void;
  createUtterance?: (text: string) => BrowserUtterance;
  cancel?: () => void;
  speechSupported?: boolean;
  now?: () => number;
}

export interface BrowserNarration {
  play(fromSentence?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  currentTimeMs(): number;
  getSnapshot(): BrowserNarrationSnapshot;
}

const UNSUPPORTED_MESSAGE =
  'Browser speech synthesis is not available in this environment.';

function speechGlobals(): SpeechGlobals {
  // Node and test environments have no speechSynthesis; the double cast keeps
  // the module loadable there while the browser path stays typed.
  return globalThis as unknown as SpeechGlobals;
}

function defaultSupported(): boolean {
  const globals = speechGlobals();
  return (
    typeof globals.speechSynthesis?.speak === 'function' &&
    typeof globals.SpeechSynthesisUtterance === 'function'
  );
}

function defaultCreateUtterance(text: string): BrowserUtterance {
  const Constructor = speechGlobals().SpeechSynthesisUtterance;
  if (!Constructor) {
    throw new Error(UNSUPPORTED_MESSAGE);
  }
  return new Constructor(text);
}

function defaultSynthesize(utterance: BrowserUtterance): void {
  speechGlobals().speechSynthesis?.speak(utterance);
}

function defaultCancel(): void {
  speechGlobals().speechSynthesis?.cancel();
}

/**
 * Creates a sentence-level browser narration adapter. Every dependency that
 * touches the browser is injectable so the behaviour is testable without a real
 * `speechSynthesis` implementation, and an unsupported environment produces a
 * readable error state rather than a crash.
 */
export function createBrowserNarration(
  options: BrowserNarrationOptions,
): BrowserNarration {
  const sentences = splitSentences(options.text);
  const supported = options.speechSupported ?? defaultSupported();
  const createUtterance = options.createUtterance ?? defaultCreateUtterance;
  const synthesize = options.synthesize ?? defaultSynthesize;
  const cancelSpeech = options.cancel ?? defaultCancel;
  const now = options.now ?? (() => performance.now());

  let status: BrowserNarrationStatus = supported ? 'idle' : 'error';
  let error: string | null = supported ? null : UNSUPPORTED_MESSAGE;
  let sentenceIndex = 0;
  // Every new utterance (or cancellation) bumps the generation so events from
  // a canceled or superseded utterance cannot advance playback.
  let generation = 0;
  let accumulatedMs = 0;
  let speakingSince: number | null = null;

  const activeMs = (): number =>
    accumulatedMs + (speakingSince === null ? 0 : Math.max(0, now() - speakingSince));

  const startClock = (): void => {
    speakingSince = now();
  };

  const stopClock = (): void => {
    accumulatedMs = activeMs();
    speakingSince = null;
  };

  const complete = (): void => {
    generation += 1;
    stopClock();
    status = 'completed';
  };

  const fail = (message: string): void => {
    generation += 1;
    stopClock();
    status = 'error';
    error = message;
  };

  const speakSentence = (index: number): void => {
    const sentence = sentences[index];
    if (!sentence) {
      complete();
      return;
    }

    sentenceIndex = index;
    options.onSentence?.(index);

    const utterance = createUtterance(sentence.text);
    if (options.rate !== undefined) {
      utterance.rate = options.rate;
    }
    if (options.pitch !== undefined) {
      utterance.pitch = options.pitch;
    }

    generation += 1;
    const mine = generation;

    // SpeechSynthesisUtterance is modeled with DOM `on*` handlers because the
    // injected fake only needs one listener per event; addEventListener would
    // add surface without changing behaviour.
    // oxlint-disable-next-line unicorn/prefer-add-event-listener
    utterance.onend = () => {
      if (mine === generation) {
        speakSentence(index + 1);
      }
    };
    // oxlint-disable-next-line unicorn/prefer-add-event-listener
    utterance.onerror = (event) => {
      if (mine !== generation) {
        return;
      }
      const reason = event?.error ?? 'unknown';
      // Browsers emit these when the app itself cancels; they are not failures.
      if (reason === 'canceled' || reason === 'interrupted') {
        return;
      }
      fail(`Browser speech failed: ${reason}`);
    };
    utterance.onboundary = (event) => {
      if (mine !== generation) {
        return;
      }
      if (typeof event?.charIndex === 'number') {
        options.onWord?.(sentence.charStart + event.charIndex);
      }
    };

    synthesize(utterance);
  };

  const beginAt = (index: number): void => {
    status = 'speaking';
    error = null;
    startClock();
    speakSentence(index);
  };

  const resume = (): void => {
    if (status !== 'paused') {
      return;
    }
    status = 'speaking';
    startClock();
    // Sentence-level resume: replay the sentence that was playing.
    speakSentence(sentenceIndex);
  };

  return {
    play(fromSentence?: number) {
      if (!supported || status === 'error') {
        return;
      }
      if (status === 'speaking') {
        return;
      }
      if (status === 'paused') {
        resume();
        return;
      }
      if (status === 'completed' || status === 'stopped') {
        accumulatedMs = 0;
      }
      beginAt(fromSentence ?? 0);
    },

    pause() {
      if (status !== 'speaking') {
        return;
      }
      stopClock();
      generation += 1;
      status = 'paused';
      cancelSpeech();
    },

    resume,

    stop() {
      if (!supported) {
        return;
      }
      stopClock();
      generation += 1;
      cancelSpeech();
      accumulatedMs = 0;
      speakingSince = null;
      sentenceIndex = 0;
      status = 'stopped';
      error = null;
    },

    currentTimeMs() {
      return activeMs();
    },

    getSnapshot() {
      return { status, sentenceIndex, error };
    },
  };
}
