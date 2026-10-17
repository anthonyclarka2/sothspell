export {
  AUTHORING_PROVIDERS,
  ConnectionProfileSchema,
  NARRATION_PROVIDERS,
  ProfileCreateSchema,
  ProfileFieldsSchema,
  ProfileKindSchema,
  ProfileProviderSchema,
  ProfileUpdateSchema,
} from './schema.js';
export type {
  AuthoringProvider,
  ConnectionProfile,
  NarrationProvider,
  ProfileCreateInput,
  ProfileKind,
  ProfileProvider,
  ProfileUpdateInput,
  PublicConnectionProfile,
} from './schema.js';

export { createFileSecretStore, createMemorySecretStore } from './secret-store.js';
export type { FileSecretStoreOptions, SecretStore } from './secret-store.js';

export { createSettingsService, DuplicateProfileNameError } from './service.js';
export type { SettingsService, SettingsServiceOptions } from './service.js';

export type {
  AuthoringConnection,
  ConnectionSource,
  EnvOverrides,
  NarrationConnection,
  ProfileTestReport,
  ProfileTester,
  ResolvedConnection,
} from './connections.js';

export {
  PRIVATE_FILE_MODE,
  quarantineFile,
  readJsonWithRecovery,
  writeFileAtomic,
} from './atomic.js';
