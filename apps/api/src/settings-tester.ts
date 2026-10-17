import { z } from 'zod';
import { createAiSdkGuideModel, type GuideModel } from '@sothspell/authoring';
import type {
  AuthoringConnection,
  NarrationConnection,
  ProfileTester,
  ProfileTestReport,
} from '@sothspell/settings';
import type { NarrationService } from './narration.js';

/**
 * The real provider test behind `POST /api/settings/profiles/:id/test`.
 * Authoring asks the model for a tiny structured object; narration synthesizes
 * one short line, which the asset store then caches by content hash. Every
 * failure message is redacted against the profile's secret before it leaves
 * this module.
 */

export const SETTINGS_TEST_TEXT = 'Sóþspell connection test.';

const ConnectivitySchema = z.object({ ok: z.boolean() });
const MAX_ERROR_DETAIL = 300;

/** Removes a known secret and common key shapes from provider error text. */
export function redactProviderMessage(message: string, secret: string | null): string {
  let redacted = message;
  if (secret) {
    redacted = redacted.split(secret).join('[redacted]');
  }
  redacted = redacted.replace(/\bsk-[A-Za-z0-9_-]{6,}\b/gu, '[redacted]');
  return redacted.length > MAX_ERROR_DETAIL
    ? `${redacted.slice(0, MAX_ERROR_DETAIL)}…`
    : redacted;
}

export interface CreateProfileTesterOptions {
  narrationService: NarrationService;
  /** Model factory seam; tests inject a deterministic fake. */
  createGuideModel?: (connection: AuthoringConnection) => GuideModel;
  now?: () => number;
}

export function createConnectionGuideModel(connection: AuthoringConnection): GuideModel {
  return createAiSdkGuideModel(connection.modelId, {
    ...(connection.apiKey === null ? {} : { apiKey: connection.apiKey }),
    ...(connection.baseUrl === null ? {} : { baseUrl: connection.baseUrl }),
  });
}
export function createProfileTester(options: CreateProfileTesterOptions): ProfileTester {
  const createGuideModel = options.createGuideModel ?? createConnectionGuideModel;
  const now = options.now ?? (() => Date.now());

  const testNarration = async (
    connection: NarrationConnection,
  ): Promise<ProfileTestReport> => {
    if (connection.provider === 'browser') {
      return {
        ok: true,
        latencyMs: 0,
        error: null,
        detail: 'browser speech runs locally; no provider call is needed',
      };
    }
    const started = now();
    try {
      await options.narrationService.synthesize({
        beatId: 'settings-connection-test',
        text: SETTINGS_TEST_TEXT,
        connection,
      });
      return {
        ok: true,
        latencyMs: now() - started,
        error: null,
        detail: `voice ${connection.voiceId ?? 'default'}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        latencyMs: now() - started,
        error: redactProviderMessage(message, connection.apiKey),
        detail: null,
      };
    }
  };

  return {
    async test(connection) {
      if (connection.kind === 'narration') {
        return testNarration(connection);
      }
      const started = now();
      try {
        const model = createGuideModel(connection);
        await model.generateObject({
          schema: ConnectivitySchema,
          schemaName: 'ConnectionTest',
          system:
            'You verify that a model connection works. Reply only with the requested JSON.',
          prompt: 'Reply with {"ok": true}.',
        });
        return {
          ok: true,
          latencyMs: now() - started,
          error: null,
          detail: `model ${connection.modelId}`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          latencyMs: now() - started,
          error: redactProviderMessage(message, connection.apiKey),
          detail: null,
        };
      }
    },
  };
}
