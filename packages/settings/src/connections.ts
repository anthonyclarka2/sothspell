import type { AuthoringProvider, NarrationProvider } from './schema.js';

/**
 * A resolved connection is the server-side view of "what should this capability
 * use right now": the active profile with environment overrides applied. It
 * carries the secret value, so it must never be serialized into an API
 * response, a log line, or a quality report.
 */

export type ConnectionSource = 'profile' | 'env';

export interface AuthoringConnection {
  kind: 'authoring';
  source: ConnectionSource;
  profileId: string | null;
  profileName: string | null;
  /** Provider-qualified id, for example `openai/gpt-5.2`. */
  modelId: string;
  provider: AuthoringProvider | null;
  baseUrl: string | null;
  apiKey: string | null;
}

export interface NarrationConnection {
  kind: 'narration';
  source: ConnectionSource;
  profileId: string | null;
  profileName: string | null;
  provider: NarrationProvider;
  voiceId: string | null;
  modelId: string | null;
  outputFormat: string | null;
  apiKey: string | null;
}

export type ResolvedConnection = AuthoringConnection | NarrationConnection;

/** Non-secret environment state the settings UI marks as read-only. */
export interface EnvOverrides {
  authoring: {
    /** `SOTHSPELL_MODEL`, when set. */
    modelId: string | null;
  };
  narration: {
    /** `ELEVENLABS_VOICE_ID`, when set. */
    voiceId: string | null;
    /** `ELEVENLABS_MODEL_ID`, when set. */
    modelId: string | null;
    /** Whether `ELEVENLABS_API_KEY` is set; the value is never exposed. */
    hasApiKey: boolean;
  };
}

export interface ProfileTestReport {
  ok: boolean;
  latencyMs: number;
  /** Redacted failure text safe to show the publisher. */
  error: string | null;
  /** Redacted success detail, for example the model or voice that answered. */
  detail: string | null;
}

/**
 * The provider-test seam. The settings package owns the contract; the API
 * supplies the real implementation and tests inject a fake.
 */
export interface ProfileTester {
  test(connection: ResolvedConnection): Promise<ProfileTestReport>;
}
