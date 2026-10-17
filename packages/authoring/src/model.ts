import type { z } from 'zod';

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface GenerateObjectInput<T> {
  schema: z.ZodType<T>;
  schemaName: string;
  system: string;
  prompt: string;
  signal?: AbortSignal;
}

export interface GenerateTextInput {
  system: string;
  prompt: string;
  signal?: AbortSignal;
}

/**
 * The authoring pipeline's only model dependency. The web app can use an AI SDK
 * provider, the OpenCode plugin can use the host's model, and tests can use a
 * deterministic fake without changing the pipeline.
 */
export interface GuideModel {
  readonly id: string;
  generateObject<T>(
    input: GenerateObjectInput<T>,
  ): Promise<{ value: T; usage?: ModelUsage }>;
  generateText(input: GenerateTextInput): Promise<{ text: string; usage?: ModelUsage }>;
}

export function normalizeUsage(usage: {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
}): ModelUsage {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
  };
}

export function addUsage(
  left: ModelUsage | undefined,
  right: ModelUsage | undefined,
): ModelUsage {
  return {
    inputTokens: (left?.inputTokens ?? 0) + (right?.inputTokens ?? 0),
    outputTokens: (left?.outputTokens ?? 0) + (right?.outputTokens ?? 0),
    totalTokens: (left?.totalTokens ?? 0) + (right?.totalTokens ?? 0),
  };
}
