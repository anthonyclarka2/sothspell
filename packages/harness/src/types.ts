import type { GuideModel } from '@sothspell/authoring';

/**
 * The harness contract. `HarnessAdapter` is the port: it describes what the
 * runtime needs from a host (project root, model access, browser launch, user
 * messages, and an event sink). `HarnessRuntime` is the shared behavior every
 * host gets: status, generate, open, progress, ask, cancel, capabilities, and
 * events. Adapters translate host APIs into the port; they never reimplement
 * authoring, storage, or player access.
 */

/** What a host can do. The runtime fails loudly when a required ability is absent. */
export interface HarnessCapabilities {
  /** The host can return schema-validated JSON, not only text. */
  structuredOutput: boolean;
  /** The host can generate text through its own model connection. */
  textGeneration: boolean;
  /** The host can show runtime messages to the user. */
  notify: boolean;
  /** The runtime may open the player URL in the user's browser. */
  browserLaunch: boolean;
  /** The host can cancel an in-flight generation. */
  cancel: boolean;
  /** The host can run generation without blocking its own turn. */
  backgroundGeneration: boolean;
}

/** Fill in conservative defaults so an adapter declares only what it changes. */
export function defineCapabilities(
  overrides: Partial<HarnessCapabilities> = {},
): HarnessCapabilities {
  return {
    structuredOutput: false,
    textGeneration: true,
    notify: false,
    browserLaunch: true,
    cancel: true,
    backgroundGeneration: false,
    ...overrides,
  };
}

export interface LaunchResult {
  url: string;
  opened: boolean;
  error?: string;
}

export interface GenerationProgress {
  stage: string;
  chapterIndex?: number;
  detail?: string;
}

/** Everything the runtime tells the host and its listeners. */
export type HarnessEvent =
  | { readonly name: 'generation.progress'; readonly progress: GenerationProgress }
  | {
      readonly name: 'run.updated';
      readonly tourId: string | null;
      readonly beatId: string | null;
      readonly completed: number;
    };

export interface HarnessRunSummary {
  beatId: string;
  completed: number;
}

export interface HarnessStatus {
  projectRoot: string;
  tourId: string | null;
  playerUrl: string;
  run: HarnessRunSummary | null;
}

export interface HarnessGenerateResult {
  tourId: string;
  playerUrl: string;
  quality: unknown;
}

export interface HarnessModelOptions {
  /** `provider/model` or a host-native model id, depending on the adapter. */
  id: string;
  model?: string;
  signal: AbortSignal;
}

/**
 * The host-side port. The runtime calls into it; an adapter implements it with
 * host APIs and nothing else.
 */
export interface HarnessAdapter {
  /** Stable adapter id, used for default model ids and error messages. */
  readonly id: string;
  readonly capabilities: HarnessCapabilities;
  /** Absolute project root the host session is working in. */
  projectRoot(): string | Promise<string>;
  /** Build the guide model the authoring pipeline calls. */
  createModel(options: HarnessModelOptions): GuideModel;
  /** Open a URL; never fatal. Defaults to the shared platform opener. */
  launch?(url: string): Promise<LaunchResult>;
  /** Show a message to the user. Optional: some hosts have no free-form channel. */
  notify?(message: string): Promise<void>;
  /** Mirror a runtime event into the host. Best-effort; must not throw. */
  emit?(event: HarnessEvent): void;
}

export interface HarnessEventStream {
  /** Subscribe to runtime events; returns an unsubscribe function. */
  on(listener: (event: HarnessEvent) => void): () => void;
}

/**
 * The behavior surface every host gets. The OpenCode plugin, the Claude Code
 * skill, and the Codex skill all call these methods; none of them reimplement
 * generation, storage, or player access.
 */
export interface HarnessRuntime {
  readonly capabilities: HarnessCapabilities;
  readonly events: HarnessEventStream;
  status(): Promise<HarnessStatus>;
  generate(input: { maxMinutes?: number }): Promise<HarnessGenerateResult>;
  open(): Promise<{ playerUrl: string }>;
  progress(): Promise<{ run: unknown | null }>;
  ask(input: { question: string; beatId?: string }): Promise<{ answer: unknown }>;
  cancel(): Promise<void>;
  /** Cancel in-flight work and drop event listeners. */
  dispose(): Promise<void>;
}

export type SothspellErrorCode =
  | 'generation_running'
  | 'generation_failed'
  | 'no_tour'
  | 'ask_failed'
  | 'unsupported_capability';

/** A named failure the host can map to its own error surface. */
export class SothspellError extends Error {
  readonly code: SothspellErrorCode;

  constructor(code: SothspellErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SothspellError';
    this.code = code;
  }
}

/** Alias used by hosts that prefer host-neutral vocabulary. */
export { SothspellError as HarnessError };
