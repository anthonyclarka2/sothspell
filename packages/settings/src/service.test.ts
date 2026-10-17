import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemorySecretStore } from './secret-store.js';
import {
  DuplicateProfileNameError,
  createSettingsService,
  type SettingsService,
} from './service.js';

const roots: string[] = [];

interface Harness {
  home: string;
  service: SettingsService;
  secrets: ReturnType<typeof createMemorySecretStore>;
  env: NodeJS.ProcessEnv;
  setNow: (iso: string) => void;
}

async function makeHarness(): Promise<Harness> {
  const home = await mkdtemp(path.join(tmpdir(), 'sothspell-settings-'));
  roots.push(home);
  const secrets = createMemorySecretStore();
  const env: NodeJS.ProcessEnv = {};
  let current = new Date('2026-10-17T00:00:00.000Z');
  let counter = 0;
  const service = createSettingsService({
    homeDirectory: home,
    secretStore: secrets,
    env,
    clock: () => current,
    generateId: () => `prof_${(counter += 1).toString().padStart(2, '0')}`,
  });
  return {
    home,
    service,
    secrets,
    env,
    setNow: (iso) => {
      current = new Date(iso);
    },
  };
}

function authoringInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Default authoring',
    kind: 'authoring' as const,
    provider: 'openai' as const,
    modelId: 'gpt-5.2',
    ...overrides,
  };
}

function narrationInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Studio voice',
    kind: 'narration' as const,
    provider: 'elevenlabs' as const,
    voiceId: 'voice-1',
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('createSettingsService', () => {
  it('creates a profile, activates the first of its kind, and writes it at 0600', async () => {
    const harness = await makeHarness();

    const created = await harness.service.createProfile(authoringInput());

    expect(created).toMatchObject({
      id: 'prof_01',
      name: 'Default authoring',
      kind: 'authoring',
      provider: 'openai',
      modelId: 'gpt-5.2',
      baseUrl: null,
      voiceId: null,
      outputFormat: null,
      secretRef: null,
      hasSecret: false,
      active: true,
      createdAt: '2026-10-17T00:00:00.000Z',
      updatedAt: '2026-10-17T00:00:00.000Z',
    });

    const filePath = path.join(harness.home, 'config', 'profiles.json');
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
    const file = JSON.parse(await readFile(filePath, 'utf8')) as {
      version: number;
      profiles: unknown[];
    };
    expect(file.version).toBe(1);
    expect(file.profiles).toHaveLength(1);
  });

  it('stores a secret behind a reference and never exposes the value', async () => {
    const harness = await makeHarness();

    const created = await harness.service.createProfile(
      authoringInput({ secret: 'sk-super-secret' }),
    );

    expect(created.secretRef).toBe('profiles/prof_01');
    expect(created.hasSecret).toBe(true);
    await expect(harness.secrets.get('profiles/prof_01')).resolves.toBe(
      'sk-super-secret',
    );

    const listed = await harness.service.listProfiles();
    expect(JSON.stringify(listed)).not.toContain('sk-super-secret');
    expect(JSON.stringify(created)).not.toContain('sk-super-secret');
  });

  it('rejects a duplicate name within a kind but allows it across kinds', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile(authoringInput({ name: 'Team key' }));

    await expect(
      harness.service.createProfile(authoringInput({ name: '  team KEY ' })),
    ).rejects.toBeInstanceOf(DuplicateProfileNameError);

    const narration = await harness.service.createProfile(
      narrationInput({ name: 'Team key' }),
    );
    expect(narration.kind).toBe('narration');
  });

  it('rejects a profile that breaks its kind rules with a named field', async () => {
    const harness = await makeHarness();

    await expect(
      harness.service.createProfile(authoringInput({ modelId: undefined })),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['modelId'] })],
    });

    await expect(
      harness.service.createProfile(
        narrationInput({ provider: 'openai', modelId: 'gpt-5.2' }),
      ),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ path: ['provider'] })],
    });
  });

  it('updates fields and timestamps, and returns null for an unknown id', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile(authoringInput());
    harness.setNow('2026-10-17T01:00:00.000Z');

    const updated = await harness.service.updateProfile('prof_01', {
      name: 'Renamed',
      modelId: 'gpt-5.2-mini',
    });

    expect(updated).toMatchObject({
      name: 'Renamed',
      modelId: 'gpt-5.2-mini',
      updatedAt: '2026-10-17T01:00:00.000Z',
    });
    await expect(
      harness.service.updateProfile('prof_missing', { name: 'x' }),
    ).resolves.toBeNull();
  });

  it('sets and clears the secret through update', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile(authoringInput());

    const withSecret = await harness.service.updateProfile('prof_01', {
      secret: 'sk-1',
    });
    expect(withSecret?.hasSecret).toBe(true);
    expect(withSecret?.secretRef).toBe('profiles/prof_01');

    const cleared = await harness.service.updateProfile('prof_01', { secret: null });
    expect(cleared?.hasSecret).toBe(false);
    expect(cleared?.secretRef).toBeNull();
    await expect(harness.secrets.has('profiles/prof_01')).resolves.toBe(false);
  });

  it('deletes a profile and its secret', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile(authoringInput({ secret: 'sk-1' }));

    await expect(harness.service.deleteProfile('prof_01')).resolves.toBe(true);
    await expect(harness.service.deleteProfile('prof_01')).resolves.toBe(false);
    await expect(harness.service.listProfiles()).resolves.toEqual([]);
    await expect(harness.secrets.has('profiles/prof_01')).resolves.toBe(false);
  });

  it('activates one profile per kind and deactivates its siblings', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile(authoringInput({ name: 'First' }));
    await harness.service.createProfile(authoringInput({ name: 'Second' }));
    await harness.service.createProfile(narrationInput());

    const activated = await harness.service.activateProfile('prof_02');

    expect(activated?.active).toBe(true);
    const listed = await harness.service.listProfiles();
    expect(listed.find((profile) => profile.id === 'prof_01')?.active).toBe(false);
    expect(listed.find((profile) => profile.id === 'prof_03')?.active).toBe(true);
    await expect(harness.service.activateProfile('prof_missing')).resolves.toBeNull();
  });

  it('resolves the active authoring connection with its secret', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile(
      authoringInput({
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
        secret: 'sk-a',
      }),
    );

    const connection = await harness.service.resolveAuthoringConnection();

    expect(connection).toMatchObject({
      kind: 'authoring',
      source: 'profile',
      profileName: 'Default authoring',
      modelId: 'anthropic/claude-sonnet-4-5',
      provider: 'anthropic',
      baseUrl: null,
      apiKey: 'sk-a',
    });
  });

  it('resolves a provider-relative model id and base URL for a compatible profile', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile(
      authoringInput({
        provider: 'openai-compatible',
        modelId: 'meta-llama/Llama-3.1-8B',
        baseUrl: 'https://api.example.com/v1',
      }),
    );

    const connection = await harness.service.resolveAuthoringConnection();

    expect(connection).toMatchObject({
      modelId: 'openai-compatible/meta-llama/Llama-3.1-8B',
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
    });
  });

  it('lets SOTHSPELL_MODEL override the active authoring profile', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile(authoringInput());
    harness.env.SOTHSPELL_MODEL = 'openai/gpt-5.2-pro';

    const connection = await harness.service.resolveAuthoringConnection();

    expect(connection).toMatchObject({
      source: 'env',
      profileId: null,
      profileName: null,
      modelId: 'openai/gpt-5.2-pro',
      apiKey: null,
    });
  });

  it('resolves the active narration connection with voice, model, and secret', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile(
      narrationInput({
        modelId: 'eleven_multilingual_v2',
        outputFormat: 'mp3_44100_128',
        secret: 'sk-el',
      }),
    );

    const connection = await harness.service.resolveNarrationConnection();

    expect(connection).toMatchObject({
      kind: 'narration',
      source: 'profile',
      provider: 'elevenlabs',
      voiceId: 'voice-1',
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128',
      apiKey: 'sk-el',
    });
  });

  it('lets ELEVENLABS_* override the active narration profile', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile(narrationInput({ secret: 'sk-profile' }));
    harness.env.ELEVENLABS_VOICE_ID = 'voice-env';
    harness.env.ELEVENLABS_MODEL_ID = 'eleven_turbo_v2';
    harness.env.ELEVENLABS_API_KEY = 'sk-env';

    const connection = await harness.service.resolveNarrationConnection();

    expect(connection).toMatchObject({
      source: 'env',
      voiceId: 'voice-env',
      modelId: 'eleven_turbo_v2',
      apiKey: 'sk-env',
    });
  });

  it('resolves browser speech without a secret', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile(
      narrationInput({ provider: 'browser', voiceId: undefined }),
    );

    const connection = await harness.service.resolveNarrationConnection();

    expect(connection).toMatchObject({
      provider: 'browser',
      voiceId: null,
      apiKey: null,
    });
  });

  it('returns null when no profile is active and no environment override exists', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile({ ...authoringInput(), activate: false });
    // The first profile auto-activates; deactivate it through update.
    await harness.service.updateProfile('prof_01', { activate: false });

    await expect(harness.service.resolveAuthoringConnection()).resolves.toBeNull();
    await expect(harness.service.resolveNarrationConnection()).resolves.toBeNull();
  });

  it('resolves a single profile for testing, ignoring environment overrides', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile(authoringInput({ secret: 'sk-a' }));
    harness.env.SOTHSPELL_MODEL = 'openai/other';

    const connection = await harness.service.resolveProfileConnection('prof_01');

    expect(connection).toMatchObject({
      source: 'profile',
      modelId: 'openai/gpt-5.2',
      apiKey: 'sk-a',
    });
    await expect(
      harness.service.resolveProfileConnection('prof_missing'),
    ).resolves.toBeNull();
  });

  it('reports environment overrides without exposing the API key', async () => {
    const harness = await makeHarness();
    harness.env.SOTHSPELL_MODEL = 'openai/gpt-5.2';
    harness.env.ELEVENLABS_VOICE_ID = 'voice-env';
    harness.env.ELEVENLABS_MODEL_ID = 'eleven_turbo_v2';
    harness.env.ELEVENLABS_API_KEY = 'sk-env';

    const overrides = harness.service.envOverrides();

    expect(overrides).toEqual({
      authoring: { modelId: 'openai/gpt-5.2' },
      narration: {
        voiceId: 'voice-env',
        modelId: 'eleven_turbo_v2',
        hasApiKey: true,
      },
    });
    expect(JSON.stringify(overrides)).not.toContain('sk-env');
  });

  it('recovers from a corrupt profiles file', async () => {
    const harness = await makeHarness();
    const configDirectory = path.join(harness.home, 'config');
    const filePath = path.join(configDirectory, 'profiles.json');
    await mkdir(configDirectory, { recursive: true });
    await writeFile(filePath, '{ nope', 'utf8');

    await expect(harness.service.listProfiles()).resolves.toEqual([]);

    const entries = await readdir(configDirectory);
    expect(entries.some((entry) => entry.startsWith('profiles.json.corrupt-'))).toBe(
      true,
    );

    const created = await harness.service.createProfile(authoringInput());
    expect(created.id).toBe('prof_01');
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
      version: 1,
      profiles: [{ id: 'prof_01' }],
    });
  });

  it('skips invalid entries instead of failing the whole list', async () => {
    const harness = await makeHarness();
    const configDirectory = path.join(harness.home, 'config');
    await mkdir(configDirectory, { recursive: true });
    await writeFile(
      path.join(configDirectory, 'profiles.json'),
      JSON.stringify({
        version: 1,
        profiles: [
          {
            id: 'prof_bad',
            name: 'Broken',
            kind: 'authoring',
            provider: 'openai',
            baseUrl: null,
            modelId: null,
            voiceId: null,
            outputFormat: null,
            secretRef: null,
            active: true,
            createdAt: '2026-10-17T00:00:00.000Z',
            updatedAt: '2026-10-17T00:00:00.000Z',
          },
          {
            id: 'prof_ok',
            name: 'Good',
            kind: 'narration',
            provider: 'browser',
            baseUrl: null,
            modelId: null,
            voiceId: null,
            outputFormat: null,
            secretRef: null,
            active: true,
            createdAt: '2026-10-17T00:00:00.000Z',
            updatedAt: '2026-10-17T00:00:00.000Z',
          },
        ],
      }),
      'utf8',
    );

    const listed = await harness.service.listProfiles();
    expect(listed.map((profile) => profile.id)).toEqual(['prof_ok']);
  });
});
