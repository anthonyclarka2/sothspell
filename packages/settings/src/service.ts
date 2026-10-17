import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { readJsonWithRecovery, writeFileAtomic } from './atomic.js';
import {
  AUTHORING_PROVIDERS,
  ConnectionProfileSchema,
  ProfileCreateSchema,
  ProfileUpdateSchema,
  type AuthoringProvider,
  type ConnectionProfile,
  type ProfileCreateInput,
  type ProfileKind,
  type ProfileUpdateInput,
  type PublicConnectionProfile,
} from './schema.js';
import { createFileSecretStore, type SecretStore } from './secret-store.js';
import type {
  AuthoringConnection,
  EnvOverrides,
  NarrationConnection,
  ResolvedConnection,
} from './connections.js';

/**
 * The settings service is the only writer of `$SOTHSPELL_HOME/config`. It owns
 * profile CRUD, activation, secret references, and the resolution rule that
 * environment variables override an active profile at runtime. Resolution
 * returns secret values to server-side callers; every public listing masks them.
 */

export class DuplicateProfileNameError extends Error {
  readonly profileName: string;

  constructor(profileName: string) {
    super(`a profile named "${profileName}" already exists for this kind`);
    this.name = 'DuplicateProfileNameError';
    this.profileName = profileName;
  }
}

export interface SettingsServiceOptions {
  /** Defaults to `$SOTHSPELL_HOME` or `~/.sothspell`. */
  homeDirectory?: string;
  secretStore?: SecretStore;
  clock?: () => Date;
  generateId?: () => string;
  /** Injectable for tests; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

export interface SettingsService {
  listProfiles(): Promise<PublicConnectionProfile[]>;
  getProfile(id: string): Promise<PublicConnectionProfile | null>;
  createProfile(input: ProfileCreateInput): Promise<PublicConnectionProfile>;
  updateProfile(
    id: string,
    input: ProfileUpdateInput,
  ): Promise<PublicConnectionProfile | null>;
  deleteProfile(id: string): Promise<boolean>;
  activateProfile(id: string): Promise<PublicConnectionProfile | null>;
  /** Resolves the active authoring connection with `SOTHSPELL_MODEL` precedence. */
  resolveAuthoringConnection(): Promise<AuthoringConnection | null>;
  /** Resolves the active narration connection with `ELEVENLABS_*` precedence. */
  resolveNarrationConnection(): Promise<NarrationConnection | null>;
  /** Resolves one profile as configured, ignoring environment overrides. */
  resolveProfileConnection(id: string): Promise<ResolvedConnection | null>;
  envOverrides(): EnvOverrides;
  /** Exposed for callers that need to redact provider errors. */
  readonly configDirectory: string;
}

interface ProfilesFile {
  version: 1;
  profiles: ConnectionProfile[];
}

function defaultHomeDirectory(): string {
  return process.env.SOTHSPELL_HOME ?? path.join(os.homedir(), '.sothspell');
}

function defaultId(): string {
  return `prof_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function secretRefFor(id: string): string {
  return `profiles/${id}`;
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase('en-US');
}

function authoringProviderFromModelId(modelId: string): AuthoringProvider | null {
  const slash = modelId.indexOf('/');
  if (slash === -1) {
    return null;
  }
  const prefix = modelId.slice(0, slash);
  return (AUTHORING_PROVIDERS as readonly string[]).includes(prefix)
    ? (prefix as AuthoringProvider)
    : null;
}

function assertNameAvailable(
  profiles: ConnectionProfile[],
  kind: ProfileKind,
  name: string,
  exceptId: string | null,
): void {
  const normalized = normalizeName(name);
  const duplicate = profiles.find(
    (profile) =>
      profile.kind === kind &&
      profile.id !== exceptId &&
      normalizeName(profile.name) === normalized,
  );
  if (duplicate) {
    throw new DuplicateProfileNameError(name);
  }
}

function deactivateSiblings(
  profiles: ConnectionProfile[],
  kind: ProfileKind,
  exceptId: string,
): ConnectionProfile[] {
  return profiles.map((profile) =>
    profile.kind === kind && profile.id !== exceptId && profile.active
      ? { ...profile, active: false }
      : profile,
  );
}

export function createSettingsService(
  options: SettingsServiceOptions = {},
): SettingsService {
  const homeDirectory = options.homeDirectory ?? defaultHomeDirectory();
  const configDirectory = path.join(homeDirectory, 'config');
  const profilesPath = path.join(configDirectory, 'profiles.json');
  const secretStore =
    options.secretStore ??
    createFileSecretStore({ filePath: path.join(configDirectory, 'secrets.json') });
  const clock = options.clock ?? (() => new Date());
  const generateId = options.generateId ?? defaultId;
  const env = options.env ?? process.env;

  async function readProfiles(): Promise<ConnectionProfile[]> {
    const parsed = await readJsonWithRecovery(profilesPath);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [];
    }
    const rawProfiles = (parsed as { profiles?: unknown }).profiles;
    if (!Array.isArray(rawProfiles)) {
      return [];
    }
    const profiles: ConnectionProfile[] = [];
    for (const raw of rawProfiles) {
      // A single invalid entry must not take down the whole settings page.
      const result = ConnectionProfileSchema.safeParse(raw);
      if (result.success) {
        profiles.push(result.data);
      }
    }
    return profiles;
  }

  async function writeProfiles(profiles: ConnectionProfile[]): Promise<void> {
    const file: ProfilesFile = { version: 1, profiles };
    await writeFileAtomic(profilesPath, `${JSON.stringify(file, null, 2)}\n`);
  }

  async function toPublic(profile: ConnectionProfile): Promise<PublicConnectionProfile> {
    const hasSecret =
      profile.secretRef !== null && (await secretStore.has(profile.secretRef));
    return { ...profile, hasSecret };
  }

  async function connectionFor(profile: ConnectionProfile): Promise<ResolvedConnection> {
    const secret = profile.secretRef ? await secretStore.get(profile.secretRef) : null;
    if (profile.kind === 'authoring') {
      return {
        kind: 'authoring',
        source: 'profile',
        profileId: profile.id,
        profileName: profile.name,
        // The stored model id is provider-relative; the factory and the quality
        // report use the qualified form, matching SOTHSPELL_MODEL.
        modelId: `${profile.provider}/${profile.modelId ?? ''}`,
        provider: profile.provider as AuthoringProvider,
        baseUrl: profile.baseUrl,
        apiKey: secret,
      };
    }
    return {
      kind: 'narration',
      source: 'profile',
      profileId: profile.id,
      profileName: profile.name,
      provider: profile.provider as NarrationConnection['provider'],
      voiceId: profile.voiceId,
      modelId: profile.modelId,
      outputFormat: profile.outputFormat,
      apiKey: secret,
    };
  }

  function envOverrides(): EnvOverrides {
    return {
      authoring: {
        modelId: env.SOTHSPELL_MODEL ?? null,
      },
      narration: {
        voiceId: env.ELEVENLABS_VOICE_ID ?? null,
        modelId: env.ELEVENLABS_MODEL_ID ?? null,
        hasApiKey: Boolean(env.ELEVENLABS_API_KEY),
      },
    };
  }

  return {
    configDirectory,

    envOverrides,

    async listProfiles() {
      const profiles = await readProfiles();
      const order: Record<ProfileKind, number> = { authoring: 0, narration: 1 };
      const sorted = [...profiles].toSorted(
        (left, right) =>
          order[left.kind] - order[right.kind] ||
          left.createdAt.localeCompare(right.createdAt),
      );
      return Promise.all(sorted.map(toPublic));
    },

    async getProfile(id) {
      const profile = (await readProfiles()).find((entry) => entry.id === id);
      return profile ? toPublic(profile) : null;
    },

    async createProfile(input) {
      const parsed = ProfileCreateSchema.parse(input);
      const profiles = await readProfiles();
      assertNameAvailable(profiles, parsed.kind, parsed.name, null);

      const now = clock().toISOString();
      const id = generateId();
      const candidate = ConnectionProfileSchema.parse({
        id,
        name: parsed.name,
        kind: parsed.kind,
        provider: parsed.provider,
        baseUrl: parsed.baseUrl ?? null,
        modelId: parsed.modelId ?? null,
        voiceId: parsed.voiceId ?? null,
        outputFormat: parsed.outputFormat ?? null,
        secretRef: null,
        active: false,
        createdAt: now,
        updatedAt: now,
      });

      if (parsed.secret !== undefined) {
        await secretStore.set(secretRefFor(id), parsed.secret);
        candidate.secretRef = secretRefFor(id);
      }

      // The first profile of a kind becomes active; the publisher can also ask
      // for activation explicitly.
      const shouldActivate =
        parsed.activate === true ||
        !profiles.some((profile) => profile.kind === candidate.kind && profile.active);
      candidate.active = shouldActivate;
      const next = shouldActivate
        ? [...deactivateSiblings(profiles, candidate.kind, candidate.id), candidate]
        : [...profiles, candidate];

      await writeProfiles(next);
      return toPublic(candidate);
    },

    async updateProfile(id, input) {
      const parsed = ProfileUpdateSchema.parse(input);
      const profiles = await readProfiles();
      const index = profiles.findIndex((entry) => entry.id === id);
      const existing = profiles[index];
      if (index === -1 || !existing) {
        return null;
      }

      if (parsed.name !== undefined) {
        assertNameAvailable(profiles, existing.kind, parsed.name, id);
      }

      const updated: ConnectionProfile = {
        ...existing,
        ...(parsed.name === undefined ? {} : { name: parsed.name }),
        ...(parsed.provider === undefined ? {} : { provider: parsed.provider }),
        ...(parsed.baseUrl === undefined ? {} : { baseUrl: parsed.baseUrl }),
        ...(parsed.modelId === undefined ? {} : { modelId: parsed.modelId }),
        ...(parsed.voiceId === undefined ? {} : { voiceId: parsed.voiceId }),
        ...(parsed.outputFormat === undefined
          ? {}
          : { outputFormat: parsed.outputFormat }),
        updatedAt: clock().toISOString(),
      };

      if (parsed.secret === null) {
        if (updated.secretRef) {
          await secretStore.delete(updated.secretRef);
        }
        updated.secretRef = null;
      } else if (parsed.secret !== undefined) {
        updated.secretRef ??= secretRefFor(id);
        await secretStore.set(updated.secretRef, parsed.secret);
      }

      if (parsed.activate !== undefined) {
        updated.active = parsed.activate;
      }

      // Validate the merged profile before writing anything: an invalid update
      // must not corrupt the stored file or the secret store.
      const validated = ConnectionProfileSchema.parse(updated);
      let next = [...profiles];
      next[index] = validated;
      if (validated.active) {
        next = deactivateSiblings(next, validated.kind, validated.id);
        next[index] = validated;
      }

      await writeProfiles(next);
      return toPublic(validated);
    },

    async deleteProfile(id) {
      const profiles = await readProfiles();
      const existing = profiles.find((entry) => entry.id === id);
      if (!existing) {
        return false;
      }
      if (existing.secretRef) {
        await secretStore.delete(existing.secretRef);
      }
      await writeProfiles(profiles.filter((entry) => entry.id !== id));
      return true;
    },

    async activateProfile(id) {
      const profiles = await readProfiles();
      const existing = profiles.find((entry) => entry.id === id);
      if (!existing) {
        return null;
      }
      const activated: ConnectionProfile = {
        ...existing,
        active: true,
        updatedAt: clock().toISOString(),
      };
      const next = deactivateSiblings(profiles, activated.kind, activated.id).map(
        (profile) => (profile.id === id ? activated : profile),
      );
      await writeProfiles(next);
      return toPublic(activated);
    },

    async resolveAuthoringConnection() {
      const overrides = envOverrides();
      if (overrides.authoring.modelId) {
        return {
          kind: 'authoring',
          source: 'env',
          profileId: null,
          profileName: null,
          modelId: overrides.authoring.modelId,
          provider: authoringProviderFromModelId(overrides.authoring.modelId),
          baseUrl: null,
          apiKey: null,
        };
      }
      const active = (await readProfiles()).find(
        (profile) => profile.kind === 'authoring' && profile.active,
      );
      if (!active) {
        return null;
      }
      return (await connectionFor(active)) as AuthoringConnection;
    },

    async resolveNarrationConnection() {
      const overrides = envOverrides();
      if (overrides.narration.voiceId) {
        return {
          kind: 'narration',
          source: 'env',
          profileId: null,
          profileName: null,
          provider: 'elevenlabs',
          voiceId: overrides.narration.voiceId,
          modelId: overrides.narration.modelId,
          outputFormat: null,
          apiKey: env.ELEVENLABS_API_KEY ?? null,
        };
      }
      const active = (await readProfiles()).find(
        (profile) => profile.kind === 'narration' && profile.active,
      );
      if (!active) {
        return null;
      }
      return (await connectionFor(active)) as NarrationConnection;
    },

    async resolveProfileConnection(id) {
      const profile = (await readProfiles()).find((entry) => entry.id === id);
      if (!profile) {
        return null;
      }
      return connectionFor(profile);
    },
  };
}
