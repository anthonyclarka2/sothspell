import { Buffer } from 'node:buffer';
import { normalizeAlignment } from './alignment.js';
import { narrationContentHash } from './content.js';
import { splitSentences } from './sentences.js';
import type {
  CharacterAlignment,
  NarrationAssetRecord,
  NarrationSegment,
} from './types.js';

/**
 * ElevenLabs cloud narration. The adapter is deliberately one function over an
 * injectable `fetch`: it fetches audio plus character timestamps, normalizes the
 * timings, and returns the cache record and the player segment together so the
 * API route can store and serve them without re-deriving either.
 */

const API_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128';
const DEFAULT_RETRY_DELAY_MS = 250;
const MAX_ATTEMPTS = 2;
const MAX_ERROR_DETAIL = 300;

export interface SynthesizeElevenLabsOptions {
  text: string;
  voiceId: string;
  modelId?: string;
  beatId: string;
  apiKey: string;
  outputFormat?: string;
  /** URL written into the segment's audio descriptor. Defaults to `/api/audio/<hash>`. */
  audioUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  retryDelayMs?: number;
  signal?: AbortSignal;
}

export interface ElevenLabsSynthesis {
  audio: Buffer;
  mimeType: string;
  record: NarrationAssetRecord;
  segment: NarrationSegment;
}

interface TimestampResponse {
  audio_base64?: unknown;
  alignment?: unknown;
  normalized_alignment?: unknown;
}

function mimeTypeForFormat(outputFormat: string): string {
  if (outputFormat.startsWith('mp3')) {
    return 'audio/mpeg';
  }
  if (outputFormat.startsWith('pcm')) {
    return 'audio/wav';
  }
  if (outputFormat.startsWith('ulaw')) {
    return 'audio/basic';
  }
  if (outputFormat.startsWith('opus')) {
    return 'audio/ogg';
  }
  return 'application/octet-stream';
}

function parseAlignment(value: unknown): CharacterAlignment | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const {
    characters,
    character_start_times_seconds: starts,
    character_end_times_seconds: ends,
  } = record;

  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) {
    return null;
  }
  if (
    !characters.every((character): character is string => typeof character === 'string')
  ) {
    return null;
  }
  if (
    !starts.every(
      (seconds): seconds is number =>
        typeof seconds === 'number' && Number.isFinite(seconds),
    )
  ) {
    return null;
  }
  if (
    !ends.every(
      (seconds): seconds is number =>
        typeof seconds === 'number' && Number.isFinite(seconds),
    )
  ) {
    return null;
  }

  return {
    characters,
    characterStartTimesSeconds: starts,
    characterEndTimesSeconds: ends,
  };
}

/** Keeps a provider or network message useful without ever echoing the key. */
function redact(message: string, secret: string): string {
  return secret ? message.split(secret).join('[redacted]') : message;
}

function truncate(message: string): string {
  return message.length > MAX_ERROR_DETAIL
    ? `${message.slice(0, MAX_ERROR_DETAIL)}…`
    : message;
}

async function readErrorDetail(response: Response, apiKey: string): Promise<string> {
  const detail = await response.text().catch(() => '');
  return truncate(redact(detail.trim(), apiKey));
}

/**
 * Synthesizes one beat through ElevenLabs and returns the audio, its asset
 * record, and the player-facing segment. Retries exactly once on rate limits
 * and server errors; other client errors are final.
 */
export async function synthesizeElevenLabs(
  options: SynthesizeElevenLabsOptions,
): Promise<ElevenLabsSynthesis> {
  const apiKey = options.apiKey.trim();
  if (apiKey.length === 0) {
    throw new Error('An ElevenLabs API key is required to synthesize cloud narration.');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const outputFormat = options.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
  const url = `${API_BASE}/${encodeURIComponent(options.voiceId)}/with-timestamps?output_format=${encodeURIComponent(outputFormat)}`;
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({ text: options.text, model_id: options.modelId }),
    signal: options.signal,
  };

  let response: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'network error';
      throw new Error(redact(`ElevenLabs narration request failed: ${message}`, apiKey), {
        cause: error,
      });
    }

    if (response.ok) {
      break;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) {
      break;
    }

    // Drain the failed response before retrying so the connection is reusable.
    await response.text().catch(() => '');
    await sleep(retryDelayMs);
  }

  if (!response) {
    throw new Error('ElevenLabs narration request failed without a response.');
  }
  if (!response.ok) {
    const detail = await readErrorDetail(response, apiKey);
    throw new Error(
      `ElevenLabs narration request failed with status ${response.status}${detail ? `: ${detail}` : ''}`,
    );
  }

  let payload: TimestampResponse;
  try {
    payload = (await response.json()) as TimestampResponse;
  } catch {
    throw new Error('ElevenLabs returned a response that was not valid JSON.');
  }

  const audioBase64 =
    typeof payload.audio_base64 === 'string' ? payload.audio_base64 : '';
  if (audioBase64.length === 0) {
    throw new Error('ElevenLabs returned no audio for the narration request.');
  }

  const alignment = parseAlignment(payload.alignment) ??
    parseAlignment(payload.normalized_alignment) ?? {
      characters: [],
      characterStartTimesSeconds: [],
      characterEndTimesSeconds: [],
    };

  const mimeType = mimeTypeForFormat(outputFormat);
  const contentHash = narrationContentHash(
    options.text,
    options.voiceId,
    options.modelId,
    outputFormat,
  );
  const { sentences, words } = normalizeAlignment(
    options.text,
    splitSentences(options.text),
    alignment,
  );

  const alignedEndMs =
    alignment.characterEndTimesSeconds.length > 0
      ? Math.round(Math.max(...alignment.characterEndTimesSeconds) * 1000)
      : 0;
  const durationMs = alignedEndMs > 0 ? alignedEndMs : (sentences.at(-1)?.endMs ?? 0);

  const record: NarrationAssetRecord = {
    contentHash,
    mimeType,
    durationMs,
    provider: 'elevenlabs',
    voiceId: options.voiceId,
    modelId: options.modelId,
    alignment,
  };

  const segment: NarrationSegment = {
    beatId: options.beatId,
    text: options.text,
    sentences,
    words,
    audio: {
      contentHash,
      url: options.audioUrl ?? `/api/audio/${contentHash}`,
      mimeType,
      durationMs,
    },
    provider: 'elevenlabs',
    voiceId: options.voiceId,
    modelId: options.modelId,
    contentHash,
  };

  return {
    audio: Buffer.from(audioBase64, 'base64'),
    mimeType,
    record,
    segment,
  };
}
