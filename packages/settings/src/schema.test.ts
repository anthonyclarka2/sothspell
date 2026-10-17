import { describe, expect, it } from 'vitest';
import {
  ConnectionProfileSchema,
  ProfileCreateSchema,
  ProfileUpdateSchema,
  type ConnectionProfile,
} from './schema.js';

function profile(overrides: Partial<ConnectionProfile> = {}): unknown {
  return {
    id: 'prof_1',
    name: 'Default authoring',
    kind: 'authoring',
    provider: 'openai',
    baseUrl: null,
    modelId: 'gpt-5.2',
    voiceId: null,
    outputFormat: null,
    secretRef: null,
    active: true,
    createdAt: '2026-10-17T00:00:00.000Z',
    updatedAt: '2026-10-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('ConnectionProfileSchema', () => {
  it('accepts a complete authoring profile', () => {
    const result = ConnectionProfileSchema.safeParse(profile());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.modelId).toBe('gpt-5.2');
      expect(result.data.kind).toBe('authoring');
    }
  });

  it('accepts an ElevenLabs narration profile', () => {
    const result = ConnectionProfileSchema.safeParse(
      profile({
        name: 'Studio voice',
        kind: 'narration',
        provider: 'elevenlabs',
        modelId: 'eleven_multilingual_v2',
        voiceId: 'voice-1',
        outputFormat: 'mp3_44100_128',
        secretRef: 'profiles/prof_1',
      }),
    );

    expect(result.success).toBe(true);
  });

  it('accepts a browser narration profile without a voice', () => {
    const result = ConnectionProfileSchema.safeParse(
      profile({ kind: 'narration', provider: 'browser', modelId: null }),
    );

    expect(result.success).toBe(true);
  });

  it('names the provider field when the provider cannot author', () => {
    const result = ConnectionProfileSchema.safeParse(
      profile({ provider: 'elevenlabs', voiceId: 'voice-1' }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((entry) => entry.path[0] === 'provider');
      expect(issue?.message).toMatch(/cannot author/);
      expect(issue?.message).toMatch(/openai/);
    }
  });

  it('names the modelId field when an authoring profile has no model', () => {
    const result = ConnectionProfileSchema.safeParse(profile({ modelId: null }));

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((entry) => entry.path[0] === 'modelId');
      expect(issue?.message).toMatch(/modelId is required/);
    }
  });

  it('requires a base URL for an openai-compatible profile', () => {
    const result = ConnectionProfileSchema.safeParse(
      profile({ provider: 'openai-compatible', baseUrl: null }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((entry) => entry.path[0] === 'baseUrl');
      expect(issue?.message).toMatch(/baseUrl is required/);
    }
  });

  it('rejects a base URL that is not an absolute URL', () => {
    const result = ConnectionProfileSchema.safeParse(
      profile({ provider: 'openai-compatible', baseUrl: 'api.example.com' }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((entry) => entry.path[0] === 'baseUrl');
      expect(issue?.message).toMatch(/absolute URL/);
    }
  });

  it('requires a voice id for an ElevenLabs profile', () => {
    const result = ConnectionProfileSchema.safeParse(
      profile({
        kind: 'narration',
        provider: 'elevenlabs',
        modelId: null,
        voiceId: null,
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((entry) => entry.path[0] === 'voiceId');
      expect(issue?.message).toMatch(/voiceId is required/);
    }
  });

  it('rejects narration-only fields on an authoring profile', () => {
    const result = ConnectionProfileSchema.safeParse(
      profile({ voiceId: 'voice-1', outputFormat: 'mp3_44100_128' }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((entry) => entry.path[0]);
      expect(paths).toContain('voiceId');
      expect(paths).toContain('outputFormat');
    }
  });
});

describe('ProfileCreateSchema', () => {
  it('trims the name and accepts a write-only secret', () => {
    const result = ProfileCreateSchema.safeParse({
      name: '  Team key  ',
      kind: 'authoring',
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-5',
      secret: 'sk-test',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Team key');
    }
  });

  it('rejects an unknown kind with a message that names the field', () => {
    const result = ProfileCreateSchema.safeParse({
      name: 'x',
      kind: 'images',
      provider: 'openai',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path[0]).toBe('kind');
    }
  });
});

describe('ProfileUpdateSchema', () => {
  it('accepts a partial update', () => {
    const result = ProfileUpdateSchema.safeParse({ modelId: 'gpt-5.2-mini' });
    expect(result.success).toBe(true);
  });

  it('accepts null to clear a secret', () => {
    const result = ProfileUpdateSchema.safeParse({ secret: null });
    expect(result.success).toBe(true);
  });

  it('rejects an empty update', () => {
    const result = ProfileUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
