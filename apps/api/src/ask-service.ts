import { readFile } from 'node:fs/promises';
import { parseSothspell, type SothspellDocument } from '@sothspell/core';
import {
  answerQuestion,
  createAiSdkGuideModel,
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
  tourId: string;
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
  resolveTourPath: (tourId: string) => Promise<string | null>;
  sourceRoot: string | null;
  modelId?: string | null;
  model?: GuideModel;
}

/**
 * Answers questions about any locally available tour. The tour document is the
 * source of anchors; the model is created only when a question arrives.
 */
export function createAskService(options: CreateAskServiceOptions): AskService {
  const documents = new Map<string, Promise<SothspellDocument>>();
  let model: GuideModel | null = options.model ?? null;

  const loadDocument = (tourId: string): Promise<SothspellDocument> => {
    const cached = documents.get(tourId);
    if (cached) {
      return cached;
    }
    const promise = options.resolveTourPath(tourId).then((tourPath) => {
      if (!tourPath) {
        throw new AskUnavailableError(`unknown tour: ${tourId}`);
      }
      return readFile(tourPath, 'utf8').then((raw) =>
        parseSothspell(JSON.parse(raw) as unknown),
      );
    });
    documents.set(tourId, promise);
    return promise;
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
      const document = await loadDocument(request.tourId);
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
