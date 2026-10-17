import { generateObject, generateText } from 'ai';
import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI, openai } from '@ai-sdk/openai';
import {
  normalizeUsage,
  type GenerateObjectInput,
  type GenerateTextInput,
  type GuideModel,
  type ModelUsage,
} from './model.js';

export interface AiSdkGuideModelOptions {
  /** Provider credential override; connection profiles supply their stored key. */
  apiKey?: string;
  /** Endpoint override for self-hosted gateways and OpenAI-compatible servers. */
  baseUrl?: string;
}

function resolveProvider(modelId: string): {
  provider: 'openai' | 'anthropic' | 'openai-compatible';
  model: string;
} {
  const slash = modelId.indexOf('/');
  if (slash === -1) {
    throw new Error(
      `model id must look like <provider>/<model>, for example openai/gpt-5.2; got ${modelId}`,
    );
  }
  const provider = modelId.slice(0, slash);
  const model = modelId.slice(slash + 1);
  if (!model) {
    throw new Error(`model id is missing a model name: ${modelId}`);
  }
  if (
    provider !== 'openai' &&
    provider !== 'anthropic' &&
    provider !== 'openai-compatible'
  ) {
    throw new Error(`unsupported model provider: ${provider}`);
  }
  return { provider, model };
}

function createLanguageModel(
  provider: 'openai' | 'anthropic' | 'openai-compatible',
  model: string,
  options: AiSdkGuideModelOptions,
) {
  const apiKey = options.apiKey;
  const baseURL = options.baseUrl;

  if (provider === 'anthropic') {
    if (apiKey || baseURL) {
      return createAnthropic({
        ...(apiKey ? { apiKey } : {}),
        ...(baseURL ? { baseURL } : {}),
      })(model);
    }
    return anthropic(model);
  }

  if (provider === 'openai-compatible') {
    // Chat completions is the compatible default; responses-API-only servers
    // are out of scope for a generic endpoint.
    return createOpenAI({
      ...(apiKey ? { apiKey } : {}),
      ...(baseURL ? { baseURL } : {}),
      name: 'openai-compatible',
    }).chat(model);
  }

  if (baseURL) {
    return createOpenAI({
      ...(apiKey ? { apiKey } : {}),
      baseURL,
    }).chat(model);
  }
  return apiKey ? createOpenAI({ apiKey })(model) : openai(model);
}

/**
 * AI SDK 7 adapter. The authoring pipeline only knows the GuideModel interface;
 * this adapter is the bridge to a real provider. Connection profiles pass their
 * stored key and endpoint through `options` so no environment variable is
 * required; without options the provider defaults (and their env keys) apply.
 */
export function createAiSdkGuideModel(
  modelId: string,
  options: AiSdkGuideModelOptions = {},
): GuideModel {
  const { provider, model } = resolveProvider(modelId);
  const languageModel = createLanguageModel(provider, model, options);

  return {
    id: modelId,

    async generateObject<T>(
      input: GenerateObjectInput<T>,
    ): Promise<{ value: T; usage?: ModelUsage }> {
      const result = await generateObject({
        model: languageModel,
        schema: input.schema,
        schemaName: input.schemaName,
        system: input.system,
        prompt: input.prompt,
        ...(input.signal === undefined ? {} : { abortSignal: input.signal }),
      });
      return {
        value: result.object as T,
        usage: normalizeUsage(result.usage),
      };
    },

    async generateText(
      input: GenerateTextInput,
    ): Promise<{ text: string; usage?: ModelUsage }> {
      const result = await generateText({
        model: languageModel,
        system: input.system,
        prompt: input.prompt,
        ...(input.signal === undefined ? {} : { abortSignal: input.signal }),
      });
      return {
        text: result.text,
        usage: normalizeUsage(result.usage),
      };
    },
  };
}
