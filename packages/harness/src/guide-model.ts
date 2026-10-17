import { z } from 'zod';
import type {
  GenerateObjectInput,
  GenerateTextInput,
  GuideModel,
} from '@sothspell/authoring';

/**
 * The shared guide model for hosts that expose text or schema-validated JSON
 * but not a structured-output API of their own. It owns the JSON-only prompt,
 * the schema check, and a bounded repair loop so every host adapter behaves the
 * same when a model drifts off format. `generateObject` on the host is tried
 * first when the host can validate against a schema itself.
 */

export interface TextGuideModelHost {
  generateText(input: {
    system: string;
    prompt: string;
    signal?: AbortSignal;
  }): Promise<string>;
  generateObject?(input: {
    system: string;
    prompt: string;
    schema: z.ZodType;
    schemaName: string;
    signal?: AbortSignal;
  }): Promise<unknown>;
}

export interface TextGuideModelOptions {
  id: string;
  maxRepairAttempts?: number;
  signal?: AbortSignal | undefined;
}

export function jsonSchemaHint(schema: z.ZodType): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema, { unrepresentable: 'any' }));
  } catch {
    return '"an object matching the requested shape"';
  }
}

export function jsonOnlySystem(system: string, schema: z.ZodType): string {
  return [
    system,
    'Respond with exactly one JSON object and no other text.',
    'Do not wrap the object in Markdown fences.',
    `The object must validate against this JSON Schema: ${jsonSchemaHint(schema)}`,
  ].join('\n\n');
}

export function parseJson(text: string): unknown {
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

export function createTextGuideModel(
  host: TextGuideModelHost,
  options: TextGuideModelOptions,
): GuideModel {
  const maxRepairAttempts = Math.max(0, options.maxRepairAttempts ?? 2);

  return {
    id: options.id,

    async generateObject<T>(input: GenerateObjectInput<T>): Promise<{ value: T }> {
      const schema = input.schema;
      const signal = input.signal ?? options.signal;
      let lastError = 'the model did not return JSON';

      if (typeof host.generateObject === 'function') {
        signal?.throwIfAborted();
        try {
          const value = await host.generateObject({
            system: input.system,
            prompt: input.prompt,
            schema,
            schemaName: input.schemaName,
            ...(signal === undefined ? {} : { signal }),
          });
          const parsed = schema.safeParse(value);
          if (parsed.success) {
            return { value: parsed.data };
          }
          lastError = issuesFrom(parsed.error).join('; ');
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }

      const system = jsonOnlySystem(input.system, schema);
      let prompt = input.prompt;

      for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
        const attemptSignal = input.signal ?? options.signal;
        attemptSignal?.throwIfAborted();
        // A host failure (network, missing credential) propagates as-is; only
        // a model response that parses but violates the schema is repaired.
        const text = await host.generateText({
          system,
          prompt,
          ...(attemptSignal === undefined ? {} : { signal: attemptSignal }),
        });
        try {
          const parsed = schema.safeParse(parseJson(text));
          if (parsed.success) {
            return { value: parsed.data };
          }
          lastError = issuesFrom(parsed.error).join('; ');
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }

        if (attempt < maxRepairAttempts) {
          prompt = [
            'Your previous response could not be used.',
            `Validation issues: ${lastError}`,
            `Previous response:\n${text.slice(0, 4000)}`,
            `Return a corrected JSON object for ${input.schemaName}.`,
          ].join('\n\n');
        }
      }

      throw new Error(
        `the model did not return valid ${input.schemaName} JSON after ${maxRepairAttempts + 1} attempt(s): ${lastError}`,
      );
    },

    async generateText(input: GenerateTextInput): Promise<{ text: string }> {
      const signal = input.signal ?? options.signal;
      signal?.throwIfAborted();
      const text = await host.generateText({
        system: input.system,
        prompt: input.prompt,
        ...(signal === undefined ? {} : { signal }),
      });
      return { text };
    },
  };
}
