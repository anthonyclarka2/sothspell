import { generateObject, generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import {
  normalizeUsage,
  type GenerateObjectInput,
  type GenerateTextInput,
  type GuideModel,
  type ModelUsage,
} from './model.js';

function resolveProvider(modelId: string): {
  provider: 'openai' | 'anthropic';
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
  if (provider !== 'openai' && provider !== 'anthropic') {
    throw new Error(`unsupported model provider: ${provider}`);
  }
  return { provider, model };
}

/**
 * AI SDK 7 adapter. The authoring pipeline only knows the GuideModel interface;
 * this adapter is the bridge to a real provider and can be swapped for the
 * OpenCode host in Phase 7.
 */
export function createAiSdkGuideModel(modelId: string): GuideModel {
  const { provider, model } = resolveProvider(modelId);
  const languageModel = provider === 'anthropic' ? anthropic(model) : openai(model);

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
