import { readFile } from 'node:fs/promises';
import { parseSothspell, type SothspellDocument } from '@sothspell/core';
import {
  answerQuestion,
  createAiSdkGuideModel,
  type AskAnswer,
  type AskHistoryEntry,
  type AskQuestionResult,
  type GuideModel,
} from '@sothspell/authoring';

export class AskUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AskUnavailableError';
  }
}

export interface AskRequest {
  beatId: string;
  question: string;
  history?: AskHistoryEntry[];
}

export interface AskServiceResult extends AskQuestionResult {
  modelId: string;
}

export interface AskService {
  answer(request: AskRequest): Promise<AskServiceResult>;
}

export interface CreateAskServiceOptions {
  tourJsonPath: string;
  sourceRoot: string | null;
  modelId?: string | null;
  model?: GuideModel;
}

/**
 * Answers questions about the checked-in tour. The tour document is the source
 * of anchors; the model is only created when a question actually arrives, so a
 * player without a provider key still plays normally.
 */
export function createAskService(options: CreateAskServiceOptions): AskService {
  let documentPromise: Promise<SothspellDocument> | null = null;
  let model: GuideModel | null = options.model ?? null;

  const loadDocument = (): Promise<SothspellDocument> => {
    documentPromise ??= readFile(options.tourJsonPath, 'utf8').then((raw) =>
      parseSothspell(JSON.parse(raw) as unknown),
    );
    return documentPromise;
  };

  const resolveModel = (): GuideModel => {
    if (model) {
      return model;
    }
    const modelId = options.modelId ?? process.env.SOTHSPELL_MODEL ?? null;
    if (!modelId || modelId === 'fixture' || modelId === 'fake') {
      throw new AskUnavailableError(
        'no model configured for in-tour questions; set SOTHSPELL_MODEL to a provider/model id',
      );
    }
    model = createAiSdkGuideModel(modelId);
    return model;
  };

  return {
    async answer(request) {
      const document = await loadDocument();
      const guide = resolveModel();
      const result = await answerQuestion({
        question: request.question,
        tour: document,
        beatId: request.beatId,
        sourceRoot: options.sourceRoot ?? process.cwd(),
        model: guide,
        ...(request.history === undefined ? {} : { history: request.history }),
      });
      return { ...result, modelId: guide.id };
    },
  };
}

export type { AskAnswer, AskQuestionResult };
