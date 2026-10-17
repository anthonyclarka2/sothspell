/**
 * `@sothspell/harness` — the shared runtime and the adapter port every Sóþspell
 * host consumes. Host-specific translation lives in adapter packages
 * (`@sothspell/opencode-plugin`, `@sothspell/harness-claude-code`,
 * `@sothspell/harness-codex`); the conformance suite lives at
 * `@sothspell/harness/conformance`.
 */

export {
  createHarnessRuntime,
  completedBeatCount,
  runSummary,
  projectSlug,
  slugify,
  perInstallClientId,
  DEFAULT_SERVE_URL,
  DEFAULT_MAX_MINUTES,
  DEFAULT_START_HINT,
  type HarnessRuntimeDependencies,
  type HarnessRuntimeOptions,
} from './runtime.js';

export { launchPlayer } from './launch.js';

export { formatAnswer, formatStatus, sessionStartHookOutput } from './format.js';

export {
  createTextGuideModel,
  jsonOnlySystem,
  jsonSchemaHint,
  parseJson,
  type TextGuideModelHost,
  type TextGuideModelOptions,
} from './guide-model.js';

export {
  runHarnessCommand,
  HARNESS_COMMAND_USAGE,
  type HarnessCommandIO,
  type HarnessCommandOptions,
} from './command.js';

export {
  defineCapabilities,
  SothspellError,
  SothspellError as HarnessError,
  type GenerationProgress,
  type HarnessAdapter,
  type HarnessCapabilities,
  type HarnessEvent,
  type HarnessEventStream,
  type HarnessGenerateResult,
  type HarnessModelOptions,
  type HarnessRunSummary,
  type HarnessRuntime,
  type HarnessStatus,
  type LaunchResult,
  type SothspellErrorCode,
} from './types.js';
