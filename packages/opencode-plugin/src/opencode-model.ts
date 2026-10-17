import { z } from 'zod';
import type {
  GenerateObjectInput,
  GenerateTextInput,
  GuideModel,
} from '@sothspell/authoring';

/**
 * A `GuideModel` backed by the OpenCode host model. The host exposes text, not
 * structured output, so the adapter owns the JSON-only prompt, schema check, and
 * a bounded repair loop. It never reaches for a second provider key.
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

function jsonSchemaHint(schema: z.ZodType): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema, { unrepresentable: 'any' }));
  } catch {
    return '"an object matching the requested shape"';
  }
}

function jsonOnlySystem(system: string, schema: z.ZodType): string {
  return [
    system,
    'Respond with exactly one JSON object and no other text.',
    'Do not wrap the object in Markdown fences.',
    `The object must validate against this JSON Schema: ${jsonSchemaHint(schema)}`,
  ].join('\n\n');
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as unknown;
    }
    throw new Error('the model response did not contain a JSON object');
  }
}

function issuesFrom(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const location = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${location}${issue.message}`;
  });
}

export class OpenCodeGuideModel implements GuideModel {
  readonly id: string;
  private readonly host: GuideModelHost;
  private readonly model: ModelRef | undefined;
  private readonly maxRepairAttempts: number;
  private readonly signal: AbortSignal | undefined;
  private sessionID: string | null = null;

  constructor(host: GuideModelHost, options: OpenCodeGuideModelOptions) {
    this.host = host;
    this.id = options.id;
    this.model = options.model;
    this.maxRepairAttempts = Math.max(0, options.maxRepairAttempts ?? 2);
    this.signal = options.signal;
  }

  async generateObject<T>(input: GenerateObjectInput<T>): Promise<{ value: T }> {
    const schema = input.schema;
    const system = jsonOnlySystem(input.system, schema);
    let prompt = input.prompt;
    let lastError = 'the model did not return JSON';

    for (let attempt = 0; attempt <= this.maxRepairAttempts; attempt += 1) {
      const signal = input.signal ?? this.signal;
      signal?.throwIfAborted();
      const text = await this.generateTextWith(system, prompt, signal);
      try {
        const parsed = schema.safeParse(parseJson(text));
        if (parsed.success) {
          return { value: parsed.data };
        }
        lastError = issuesFrom(parsed.error).join('; ');
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      if (attempt < this.maxRepairAttempts) {
        prompt = [
          'Your previous response could not be used.',
          `Validation issues: ${lastError}`,
          `Previous response:\n${text.slice(0, 4000)}`,
          `Return a corrected JSON object for ${input.schemaName}.`,
        ].join('\n\n');
      }
    }

    throw new Error(
      `the model did not return valid ${input.schemaName} JSON after ${this.maxRepairAttempts + 1} attempt(s): ${lastError}`,
    );
  }

  async generateText(input: GenerateTextInput): Promise<{ text: string }> {
    const signal = input.signal ?? this.signal;
    signal?.throwIfAborted();
    const text = await this.generateTextWith(input.system, input.prompt, signal);
    return { text };
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
