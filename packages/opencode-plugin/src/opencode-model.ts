import type {
  GenerateObjectInput,
  GenerateTextInput,
  GuideModel,
} from '@sothspell/authoring';
import { createTextGuideModel } from '@sothspell/harness';

/**
 * A `GuideModel` backed by the OpenCode host model. The host exposes text, not
 * structured output, so the shared text guide model owns the JSON-only prompt,
 * schema check, and bounded repair loop. This class keeps the host translation:
 * `ctx.generate.text` first, `ctx.session.generate` as the fallback.
 */

export interface ModelRef {
  providerID: string;
  id: string;
  variant?: string;
}

export interface GuideModelHost {
  readonly generate?: {
    text(
      input: { prompt: string; model?: ModelRef | null },
      options?: { signal?: AbortSignal },
    ): Promise<{ text: string }>;
  };
  readonly session?: {
    create?(input?: { title?: string }): Promise<{ id: string }>;
    generate(
      input: { sessionID: string; prompt: string },
      options?: { signal?: AbortSignal },
    ): Promise<{ text: string }>;
  };
}

export interface OpenCodeGuideModelOptions {
  id: string;
  model?: ModelRef | undefined;
  maxRepairAttempts?: number;
  signal?: AbortSignal | undefined;
}

export class OpenCodeGuideModel implements GuideModel {
  readonly id: string;
  private readonly host: GuideModelHost;
  private readonly model: ModelRef | undefined;
  private readonly inner: GuideModel;
  private sessionID: string | null = null;

  constructor(host: GuideModelHost, options: OpenCodeGuideModelOptions) {
    this.host = host;
    this.id = options.id;
    this.model = options.model;
    this.inner = createTextGuideModel(
      {
        generateText: (input) =>
          this.generateTextWith(input.system, input.prompt, input.signal),
      },
      {
        id: options.id,
        ...(options.maxRepairAttempts === undefined
          ? {}
          : { maxRepairAttempts: options.maxRepairAttempts }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );
  }

  generateObject<T>(input: GenerateObjectInput<T>): Promise<{ value: T }> {
    return this.inner.generateObject(input);
  }

  generateText(input: GenerateTextInput): Promise<{ text: string }> {
    return this.inner.generateText(input);
  }

  private async generateTextWith(
    system: string,
    prompt: string,
    signal: AbortSignal | undefined,
  ): Promise<string> {
    signal?.throwIfAborted();

    if (typeof this.host.generate?.text === 'function') {
      const result = await this.host.generate.text(
        {
          prompt: `${system}\n\n${prompt}`,
          ...(this.model === undefined ? {} : { model: this.model }),
        },
        signal === undefined ? undefined : { signal },
      );
      return result.text;
    }

    const session = this.host.session;
    if (typeof session?.generate === 'function') {
      if (this.sessionID === null) {
        if (typeof session.create !== 'function') {
          throw new Error(
            'the OpenCode host exposes session generation but cannot create a session',
          );
        }
        const created = await session.create({ title: 'Sóþspell guide' });
        this.sessionID = created.id;
      }
      const result = await session.generate(
        { sessionID: this.sessionID, prompt: `${system}\n\n${prompt}` },
        signal === undefined ? undefined : { signal },
      );
      return result.text;
    }

    throw new Error(
      'the OpenCode host does not expose text generation; enable ctx.generate.text or ctx.session.generate',
    );
  }
}
