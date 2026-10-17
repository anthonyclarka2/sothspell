import type {
  GenerateObjectInput,
  GenerateTextInput,
  GuideModel,
  ModelUsage,
} from './model.js';

export interface FakeModelRequest {
  schemaName: string;
  system: string;
  prompt: string;
}

export type FakeModelResponder = (request: FakeModelRequest) => unknown;

/**
 * Deterministic model for tests. It records every call so tests can assert
 * repair behavior and cache reuse without a network provider.
 */
export class FakeGuideModel implements GuideModel {
  readonly id: string;
  readonly calls: FakeModelRequest[] = [];

  constructor(
    private readonly responder: FakeModelResponder,
    id = 'fake',
  ) {
    this.id = id;
  }

  async generateObject<T>(
    input: GenerateObjectInput<T>,
  ): Promise<{ value: T; usage?: ModelUsage }> {
    const request: FakeModelRequest = {
      schemaName: input.schemaName,
      system: input.system,
      prompt: input.prompt,
    };
    this.calls.push(request);
    const value = this.responder(request) as T;
    return {
      value,
      usage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 },
    };
  }

  async generateText(
    input: GenerateTextInput,
  ): Promise<{ text: string; usage?: ModelUsage }> {
    this.calls.push({
      schemaName: 'text',
      system: input.system,
      prompt: input.prompt,
    });
    return {
      text: 'fixture answer',
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    };
  }
}
