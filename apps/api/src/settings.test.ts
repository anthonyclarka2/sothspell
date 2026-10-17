import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeGuideModel } from '@sothspell/authoring';
import {
  createMemorySecretStore,
  createSettingsService,
  type ProfileTester,
  type ProfileTestReport,
  type ResolvedConnection,
  type SettingsService,
} from '@sothspell/settings';
import type { Hono } from 'hono';
import { createApp } from './app.js';
import { createAskService } from './ask-service.js';
import { createDrilldownService } from './drilldown-service.js';
import { createProfileTester } from './settings-tester.js';
import {
  NarrationUnavailableError,
  createNarrationService,
  narrationContentHash,
  type AlignmentNormalizer,
  type CloudSynthesisRequest,
  type CloudSynthesizer,
} from './narration.js';
import { createMemoryAssetStore, testAlignment } from './test-support.js';

const GOLDEN_TOUR_PATH = new URL(
  '../../../examples/bunbun-tour/tour.json',
  import.meta.url,
).pathname;

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

interface AppHarness {
  app: Hono;
  service: SettingsService;
  secrets: ReturnType<typeof createMemorySecretStore>;
  env: NodeJS.ProcessEnv;
}

async function makeHarness(
  options: {
    tester?: ProfileTester | null;
  } = {},
): Promise<AppHarness> {
  const home = await mkdtemp(path.join(tmpdir(), 'sothspell-api-settings-'));
  roots.push(home);
  const secrets = createMemorySecretStore();
  const env: NodeJS.ProcessEnv = {};
  let counter = 0;
  const service = createSettingsService({
    homeDirectory: home,
    secretStore: secrets,
    env,
    generateId: () => `prof_${(counter += 1)}`,
  });
  const app = createApp({
    databasePath: ':memory:',
    settingsService: service,
    profileTester: options.tester === undefined ? null : options.tester,
  });
  return { app, service, secrets, env };
}

function fakeTester(report?: Partial<ProfileTestReport>) {
  const connections: ResolvedConnection[] = [];
  const tester: ProfileTester = {
    async test(connection) {
      connections.push(connection);
      return {
        ok: true,
        latencyMs: 12,
        error: null,
        detail: 'fake provider answered',
        ...report,
      };
    },
  };
  return { tester, connections };
}

function jsonRequest(body: unknown, method = 'POST'): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function fakeSynthesizer() {
  const calls: CloudSynthesisRequest[] = [];
  const synthesize: CloudSynthesizer = async (request) => {
    calls.push(request);
    return {
      audio: Buffer.from('fake-mp3'),
      mimeType: 'audio/mpeg',
      durationMs: 900,
      alignment: testAlignment,
    };
  };
  return { calls, synthesize };
}

const normalizer: AlignmentNormalizer = () => ({
  sentences: [
    { text: 'Hello there.', startMs: 0, endMs: 900, charStart: 0, charEnd: 12 },
  ],
  words: [],
});

describe('settings API', () => {
  it('lists profiles with environment overrides and never leaks a secret', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile({
      name: 'Team key',
      kind: 'authoring',
      provider: 'openai',
      modelId: 'gpt-5.2',
      secret: 'sk-super-secret',
    });
    harness.env.SOTHSPELL_MODEL = 'openai/gpt-5.2-pro';
    harness.env.ELEVENLABS_API_KEY = 'sk-env-secret';

    const response = await harness.app.request('/api/settings/profiles');

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      profiles: Array<{ id: string; hasSecret: boolean; secretRef: string | null }>;
      env: {
        authoring: { modelId: string | null };
        narration: { hasApiKey: boolean };
      };
    };
    expect(body.profiles).toHaveLength(1);
    expect(body.profiles[0]).toMatchObject({
      hasSecret: true,
      secretRef: 'profiles/prof_1',
    });
    expect(body.env.authoring.modelId).toBe('openai/gpt-5.2-pro');
    expect(body.env.narration.hasApiKey).toBe(true);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('sk-super-secret');
    expect(raw).not.toContain('sk-env-secret');
  });

  it('creates a profile and accepts a write-only secret', async () => {
    const harness = await makeHarness();

    const response = await harness.app.request(
      '/api/settings/profiles',
      jsonRequest({
        name: 'Team key',
        kind: 'authoring',
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
        secret: 'sk-write-only',
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ name: 'Team key', hasSecret: true, active: true });
    expect(body).not.toHaveProperty('secret');
    expect(JSON.stringify(body)).not.toContain('sk-write-only');
    await expect(harness.secrets.get('profiles/prof_1')).resolves.toBe('sk-write-only');
  });

  it('returns 409 for a duplicate name', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile({
      name: 'Team key',
      kind: 'authoring',
      provider: 'openai',
      modelId: 'gpt-5.2',
    });

    const response = await harness.app.request(
      '/api/settings/profiles',
      jsonRequest({
        name: 'team KEY',
        kind: 'authoring',
        provider: 'openai',
        modelId: 'gpt-5.2',
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('already exists'),
    });
  });

  it('returns 400 with named fields for an invalid profile', async () => {
    const harness = await makeHarness();

    const response = await harness.app.request(
      '/api/settings/profiles',
      jsonRequest({ name: 'Broken', kind: 'authoring', provider: 'openai' }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: string;
      issues: Array<{ path: string; message: string }>;
    };
    expect(body.issues).toContainEqual(
      expect.objectContaining({
        path: 'modelId',
        message: expect.stringMatching(/modelId/),
      }),
    );
  });

  it('updates a profile and clears a secret with null', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile({
      name: 'Team key',
      kind: 'authoring',
      provider: 'openai',
      modelId: 'gpt-5.2',
      secret: 'sk-1',
    });

    const updated = await harness.app.request(
      '/api/settings/profiles/prof_1',
      jsonRequest({ modelId: 'gpt-5.2-mini' }, 'PUT'),
    );
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      modelId: 'gpt-5.2-mini',
      hasSecret: true,
    });

    const cleared = await harness.app.request(
      '/api/settings/profiles/prof_1',
      jsonRequest({ secret: null }, 'PUT'),
    );
    await expect(cleared.json()).resolves.toMatchObject({
      hasSecret: false,
      secretRef: null,
    });
  });

  it('returns 404 for unknown profiles and 400 for invalid updates', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile({
      name: 'Team key',
      kind: 'authoring',
      provider: 'openai',
      modelId: 'gpt-5.2',
    });

    const unknown = await harness.app.request(
      '/api/settings/profiles/prof_missing',
      jsonRequest({ name: 'x' }, 'PUT'),
    );
    expect(unknown.status).toBe(404);

    const invalid = await harness.app.request(
      '/api/settings/profiles/prof_1',
      jsonRequest({ voiceId: 'voice-1' }, 'PUT'),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      issues: [expect.objectContaining({ path: 'voiceId' })],
    });
  });

  it('deletes a profile and its secret', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile({
      name: 'Team key',
      kind: 'authoring',
      provider: 'openai',
      modelId: 'gpt-5.2',
      secret: 'sk-1',
    });

    const removed = await harness.app.request('/api/settings/profiles/prof_1', {
      method: 'DELETE',
    });
    expect(removed.status).toBe(200);
    await expect(removed.json()).resolves.toEqual({ ok: true });
    await expect(harness.secrets.has('profiles/prof_1')).resolves.toBe(false);

    const again = await harness.app.request('/api/settings/profiles/prof_1', {
      method: 'DELETE',
    });
    expect(again.status).toBe(404);
  });

  it('activates one profile per kind', async () => {
    const harness = await makeHarness();
    await harness.service.createProfile({
      name: 'First',
      kind: 'authoring',
      provider: 'openai',
      modelId: 'gpt-5.2',
    });
    await harness.service.createProfile({
      name: 'Second',
      kind: 'authoring',
      provider: 'openai',
      modelId: 'gpt-5.2-mini',
    });

    const response = await harness.app.request('/api/settings/profiles/prof_2/activate', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: 'prof_2', active: true });
    const listed = await harness.service.listProfiles();
    expect(listed.find((profile) => profile.id === 'prof_1')?.active).toBe(false);

    const unknown = await harness.app.request(
      '/api/settings/profiles/prof_missing/activate',
      { method: 'POST' },
    );
    expect(unknown.status).toBe(404);
  });

  it('tests a profile through the injected provider seam', async () => {
    const { tester, connections } = fakeTester();
    const harness = await makeHarness({ tester });
    await harness.service.createProfile({
      name: 'Team key',
      kind: 'authoring',
      provider: 'openai',
      modelId: 'gpt-5.2',
      secret: 'sk-1',
    });

    const response = await harness.app.request('/api/settings/profiles/prof_1/test', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      latencyMs: 12,
      modelId: 'openai/gpt-5.2',
    });
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ apiKey: 'sk-1', modelId: 'openai/gpt-5.2' });
  });

  it('maps a provider failure to 502 with a redacted message', async () => {
    const { tester } = fakeTester({
      ok: false,
      error: 'auth failed for key sk-raw-secret-value',
      detail: null,
    });
    const harness = await makeHarness({ tester });
    await harness.service.createProfile({
      name: 'Team key',
      kind: 'authoring',
      provider: 'openai',
      modelId: 'gpt-5.2',
      secret: 'sk-raw-secret-value',
    });

    const response = await harness.app.request('/api/settings/profiles/prof_1/test', {
      method: 'POST',
    });

    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('[redacted]');
    expect(body.error).not.toContain('sk-raw-secret-value');
  });

  it('returns 404 for a test of an unknown profile and 503 without a tester', async () => {
    const harness = await makeHarness({ tester: null });

    const unknown = await harness.app.request(
      '/api/settings/profiles/prof_missing/test',
      { method: 'POST' },
    );
    expect(unknown.status).toBe(404);

    await harness.service.createProfile({
      name: 'Team key',
      kind: 'authoring',
      provider: 'openai',
      modelId: 'gpt-5.2',
    });
    const unavailable = await harness.app.request('/api/settings/profiles/prof_1/test', {
      method: 'POST',
    });
    expect(unavailable.status).toBe(503);
  });
});

describe('createProfileTester', () => {
  it('tests browser narration without a provider call', async () => {
    const { calls, synthesize } = fakeSynthesizer();
    const narrationService = createNarrationService({
      assetStore: createMemoryAssetStore(),
      synthesize,
      normalizeAlignment: normalizer,
    });
    const tester = createProfileTester({ narrationService });

    const report = await tester.test({
      kind: 'narration',
      source: 'profile',
      profileId: 'prof_1',
      profileName: 'Local speech',
      provider: 'browser',
      voiceId: null,
      modelId: null,
      outputFormat: null,
      apiKey: null,
    });

    expect(report.ok).toBe(true);
    expect(report.detail).toMatch(/browser speech/);
    expect(calls).toHaveLength(0);
  });

  it('synthesizes a short line for an ElevenLabs profile and caches it', async () => {
    const { calls, synthesize } = fakeSynthesizer();
    const assetStore = createMemoryAssetStore();
    const narrationService = createNarrationService({
      assetStore,
      synthesize,
      normalizeAlignment: normalizer,
    });
    const tester = createProfileTester({ narrationService });
    const connection = {
      kind: 'narration' as const,
      source: 'profile' as const,
      profileId: 'prof_1',
      profileName: 'Studio voice',
      provider: 'elevenlabs' as const,
      voiceId: 'voice-1',
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128',
      apiKey: 'sk-el',
    };

    const first = await tester.test(connection);
    const second = await tester.test(connection);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      apiKey: 'sk-el',
      voiceId: 'voice-1',
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128',
    });
  });

  it('redacts the profile secret from an authoring failure', async () => {
    const tester = createProfileTester({
      narrationService: createNarrationService({
        assetStore: createMemoryAssetStore(),
        synthesize: fakeSynthesizer().synthesize,
        normalizeAlignment: normalizer,
      }),
      createGuideModel: () => ({
        id: 'openai/gpt-5.2',
        async generateObject() {
          throw new Error('401 unauthorized: bad key sk-secret-abcdef');
        },
        async generateText() {
          return { text: '' };
        },
      }),
    });

    const report = await tester.test({
      kind: 'authoring',
      source: 'profile',
      profileId: 'prof_1',
      profileName: 'Team key',
      modelId: 'openai/gpt-5.2',
      provider: 'openai',
      baseUrl: null,
      apiKey: 'sk-secret-abcdef',
    });

    expect(report.ok).toBe(false);
    expect(report.error).toContain('[redacted]');
    expect(report.error).not.toContain('sk-secret-abcdef');
  });
});

describe('profile-aware pipeline resolution', () => {
  it('uses a resolved model for in-tour questions', async () => {
    const model = new FakeGuideModel(
      () => ({
        markdown: 'The PDS is the source of truth.',
        citations: ['anchor_readme_overview'],
        followUps: [],
      }),
      'openai/gpt-5.2',
    );
    const service = createAskService({
      resolveTourPath: async () => GOLDEN_TOUR_PATH,
      sourceRoot: null,
      resolveModel: async () => model,
    });

    const result = await service.answer({
      tourId: 'tour_bunbun_golden',
      beatId: 'beat_purpose_01',
      question: 'What is the source of truth?',
    });

    expect(result.modelId).toBe('openai/gpt-5.2');
    expect(result.answer.markdown).toContain('source of truth');
  });

  it('keeps the environment fallback when no profile resolves', async () => {
    const service = createAskService({
      resolveTourPath: async () => GOLDEN_TOUR_PATH,
      sourceRoot: null,
      modelId: null,
      resolveModel: async () => null,
    });

    await expect(
      service.answer({
        tourId: 'tour_bunbun_golden',
        beatId: 'beat_purpose_01',
        question: 'Why?',
      }),
    ).rejects.toThrow(/no model configured/);
  });

  it('uses a resolved model for drilldown', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'sothspell-drilldown-'));
    roots.push(root);
    await writeFile(
      path.join(root, 'README.md'),
      '# Bunbun\n\nA fixture for the drilldown test.\n',
      'utf8',
    );
    const narration =
      'The README opens with the project name and a one line description that anchors every later chapter. It is the first evidence a reader meets and the first place a claim about the project becomes traceable to a file.';
    const model = new FakeGuideModel(
      () => ({
        title: 'README overview',
        summary: 'A closer look at the README overview anchor.',
        diagram: {
          id: 'diagram_readme',
          kind: 'flow',
          title: 'README flow',
          nodes: [{ id: 'readme', label: 'README', type: 'file' }],
          edges: [],
        },
        beats: [
          {
            title: 'What the README says',
            narration,
            anchorIds: ['anchor_main_bootstrap'],
          },
          {
            title: 'Why it matters',
            narration: narration.replace('The README opens', 'The README overview'),
            anchorIds: ['anchor_main_bootstrap'],
          },
        ],
      }),
      'openai/gpt-5.2',
    );
    const service = createDrilldownService({
      resolveTourPath: async () => GOLDEN_TOUR_PATH,
      sourceRoot: root,
      resolveModel: async () => model,
    });

    const result = await service.generate('tour_bunbun_golden', 'anchor_main_bootstrap');

    expect(result.beats).toBe(2);
    expect(result.document.title).toContain('deeper');
    expect(model.calls[0]?.schemaName).toBe('ChapterDraft');
  });

  it('narrates through the active profile connection', async () => {
    const { calls, synthesize } = fakeSynthesizer();
    const service = createNarrationService({
      assetStore: createMemoryAssetStore(),
      synthesize,
      normalizeAlignment: normalizer,
      resolveConnection: async () => ({
        kind: 'narration',
        source: 'profile',
        profileId: 'prof_1',
        profileName: 'Studio voice',
        provider: 'elevenlabs',
        voiceId: 'voice-profile',
        modelId: 'eleven_multilingual_v2',
        outputFormat: 'mp3_44100_128',
        apiKey: 'sk-profile',
      }),
    });

    const result = await service.synthesize({ beatId: 'beat_1', text: 'Hello there.' });

    expect(calls[0]).toMatchObject({
      apiKey: 'sk-profile',
      voiceId: 'voice-profile',
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128',
    });
    expect(result.segment.voiceId).toBe('voice-profile');
    expect(result.segment.contentHash).toBe(
      narrationContentHash(
        'Hello there.',
        'voice-profile',
        'eleven_multilingual_v2',
        'mp3_44100_128',
      ),
    );
  });

  it('treats the browser narration profile as unavailable for cloud audio', async () => {
    const { calls, synthesize } = fakeSynthesizer();
    const service = createNarrationService({
      assetStore: createMemoryAssetStore(),
      synthesize,
      normalizeAlignment: normalizer,
      resolveConnection: async () => ({
        kind: 'narration',
        source: 'profile',
        profileId: 'prof_1',
        profileName: 'Local speech',
        provider: 'browser',
        voiceId: null,
        modelId: null,
        outputFormat: null,
        apiKey: null,
      }),
    });

    await expect(
      service.synthesize({ beatId: 'beat_1', text: 'Hello there.' }),
    ).rejects.toThrow(NarrationUnavailableError);
    expect(calls).toHaveLength(0);
  });

  it('lets a per-call connection override the resolved one for the connection test', async () => {
    const { calls, synthesize } = fakeSynthesizer();
    const service = createNarrationService({
      assetStore: createMemoryAssetStore(),
      synthesize,
      normalizeAlignment: normalizer,
      resolveConnection: async () => ({
        kind: 'narration',
        source: 'profile',
        profileId: 'prof_active',
        profileName: 'Active',
        provider: 'elevenlabs',
        voiceId: 'voice-active',
        modelId: null,
        outputFormat: null,
        apiKey: 'sk-active',
      }),
    });

    await service.synthesize({
      beatId: 'settings-connection-test',
      text: 'Sóþspell connection test.',
      connection: {
        kind: 'narration',
        source: 'profile',
        profileId: 'prof_other',
        profileName: 'Other',
        provider: 'elevenlabs',
        voiceId: 'voice-other',
        modelId: null,
        outputFormat: null,
        apiKey: 'sk-other',
      },
    });

    expect(calls[0]).toMatchObject({ apiKey: 'sk-other', voiceId: 'voice-other' });
  });

  it('keeps the pinned content hash for the three-argument form', () => {
    expect(narrationContentHash('Hello there.', 'voice-1', 'model-1')).toBe(
      'sha256:ff51e4188f05502a087c6714d7aa512b1b412f8465e02861d98fc0e06e5af5f3',
    );
    expect(
      narrationContentHash('Hello there.', 'voice-1', 'model-1', 'mp3_44100_128'),
    ).not.toBe(narrationContentHash('Hello there.', 'voice-1', 'model-1'));
  });
});
