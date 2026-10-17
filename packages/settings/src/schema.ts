import { z } from 'zod';

/**
 * The connection-profile domain. A profile is one named provider connection for
 * one capability kind. It never carries a secret value: `secretRef` is an
 * opaque pointer into the `SecretStore`, and the API only ever reports whether
 * the pointer resolves (`hasSecret`).
 */

export const ProfileKindSchema = z.enum(['authoring', 'narration']);

export const ProfileProviderSchema = z.enum([
  'openai',
  'anthropic',
  'openai-compatible',
  'elevenlabs',
  'browser',
]);

export type ProfileKind = z.infer<typeof ProfileKindSchema>;
export type ProfileProvider = z.infer<typeof ProfileProviderSchema>;

export const AUTHORING_PROVIDERS = [
  'openai',
  'anthropic',
  'openai-compatible',
] as const satisfies readonly ProfileProvider[];

export const NARRATION_PROVIDERS = [
  'elevenlabs',
  'browser',
] as const satisfies readonly ProfileProvider[];

export type AuthoringProvider = (typeof AUTHORING_PROVIDERS)[number];
export type NarrationProvider = (typeof NARRATION_PROVIDERS)[number];

const nameSchema = z
  .string()
  .trim()
  .min(1, 'name is required')
  .max(64, 'name must be 64 characters or fewer');

const baseUrlSchema = z
  .url('baseUrl must be an absolute URL, for example https://api.example.com/v1')
  .max(2048, 'baseUrl must be 2048 characters or fewer');

const modelIdSchema = z
  .string()
  .trim()
  .min(1, 'modelId is required')
  .max(200, 'modelId must be 200 characters or fewer');

const voiceIdSchema = z
  .string()
  .trim()
  .min(1, 'voiceId is required')
  .max(200, 'voiceId must be 200 characters or fewer');

const outputFormatSchema = z
  .string()
  .trim()
  .min(1, 'outputFormat is required when set')
  .max(64, 'outputFormat must be 64 characters or fewer');

/**
 * The stored profile. Kind-specific rules live in one `superRefine` so the
 * message always names the offending field and the expected shape.
 */
export const ConnectionProfileSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: nameSchema,
    kind: ProfileKindSchema,
    provider: ProfileProviderSchema,
    baseUrl: baseUrlSchema.nullable(),
    modelId: modelIdSchema.nullable(),
    voiceId: voiceIdSchema.nullable(),
    outputFormat: outputFormatSchema.nullable(),
    secretRef: z.string().min(1).max(128).nullable(),
    active: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .superRefine((profile, context) => {
    if (profile.kind === 'authoring') {
      if (!(AUTHORING_PROVIDERS as readonly string[]).includes(profile.provider)) {
        context.addIssue({
          code: 'custom',
          path: ['provider'],
          message: `provider "${profile.provider}" cannot author; expected openai, anthropic, or openai-compatible`,
        });
      }
      if (profile.modelId === null) {
        context.addIssue({
          code: 'custom',
          path: ['modelId'],
          message: 'modelId is required for an authoring profile',
        });
      }
      if (profile.voiceId !== null) {
        context.addIssue({
          code: 'custom',
          path: ['voiceId'],
          message: 'voiceId is not used by an authoring profile; leave it empty',
        });
      }
      if (profile.outputFormat !== null) {
        context.addIssue({
          code: 'custom',
          path: ['outputFormat'],
          message: 'outputFormat is not used by an authoring profile; leave it empty',
        });
      }
      if (profile.provider === 'openai-compatible' && profile.baseUrl === null) {
        context.addIssue({
          code: 'custom',
          path: ['baseUrl'],
          message:
            'baseUrl is required for an openai-compatible profile, for example https://api.example.com/v1',
        });
      }
    } else {
      if (!(NARRATION_PROVIDERS as readonly string[]).includes(profile.provider)) {
        context.addIssue({
          code: 'custom',
          path: ['provider'],
          message: `provider "${profile.provider}" cannot narrate; expected elevenlabs or browser`,
        });
      }
      if (profile.baseUrl !== null) {
        context.addIssue({
          code: 'custom',
          path: ['baseUrl'],
          message: 'baseUrl is not used by a narration profile; leave it empty',
        });
      }
      if (profile.provider === 'elevenlabs' && profile.voiceId === null) {
        context.addIssue({
          code: 'custom',
          path: ['voiceId'],
          message: 'voiceId is required for an ElevenLabs profile',
        });
      }
      if (profile.provider === 'browser' && profile.voiceId !== null) {
        context.addIssue({
          code: 'custom',
          path: ['voiceId'],
          message: 'voiceId is not used by the browser speech provider; leave it empty',
        });
      }
      if (profile.provider === 'browser' && profile.outputFormat !== null) {
        context.addIssue({
          code: 'custom',
          path: ['outputFormat'],
          message:
            'outputFormat is not used by the browser speech provider; leave it empty',
        });
      }
    }
  });

export type ConnectionProfile = z.infer<typeof ConnectionProfileSchema>;

/** Fields the publisher edits; system fields (id, timestamps) are service-owned. */
export const ProfileFieldsSchema = z.object({
  name: nameSchema,
  provider: ProfileProviderSchema,
  baseUrl: baseUrlSchema.nullable().optional(),
  modelId: modelIdSchema.nullable().optional(),
  voiceId: voiceIdSchema.nullable().optional(),
  outputFormat: outputFormatSchema.nullable().optional(),
});

const secretSchema = z
  .string()
  .min(1, 'secret must not be empty')
  .max(4096, 'secret must be 4096 characters or fewer');

export const ProfileCreateSchema = ProfileFieldsSchema.extend({
  kind: ProfileKindSchema,
  /** Write-only: stored in the secret store, never echoed back. */
  secret: secretSchema.optional(),
  /** Make this the active profile for its kind immediately. */
  activate: z.boolean().optional(),
});

export const ProfileUpdateSchema = ProfileFieldsSchema.partial()
  .extend({
    /** `null` clears the stored secret; omitting the field keeps it. */
    secret: secretSchema.nullable().optional(),
    activate: z.boolean().optional(),
  })
  .refine((update) => Object.keys(update).length > 0, {
    message: 'an update needs at least one field',
  });

export type ProfileCreateInput = z.infer<typeof ProfileCreateSchema>;
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;

/**
 * The public profile shape. `hasSecret` is derived from the secret store and
 * tells the UI whether a key is stored; the value itself never leaves the
 * server.
 */
export interface PublicConnectionProfile extends ConnectionProfile {
  hasSecret: boolean;
}
