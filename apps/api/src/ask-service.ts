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
  /**
   * Profile-aware resolution seam. The settings-backed resolver returns the
   * active connection's model; when it returns null the service falls back to
   * `modelId`/`SOTHSPELL_MODEL` so environment behavior is unchanged.
   */
  resolveModel?: () => Promise<GuideModel | null>;
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

  const resolveModel = async (): Promise<GuideModel> => {
    if (model) {
      return model;
    }
    if (options.resolveModel) {
      const resolved = await options.resolveModel();
      if (resolved) {
        model = resolved;
        return resolved;
      }
    }
    const modelId = options.modelId ?? process.env.SOTHSPELL_MODEL ?? null;
    if (!modelId || modelId === 'fixture' || modelId === 'fake') {
      throw new AskUnavailableError(
        'no model configured for in-tour questions; set SOTHSPELL_MODEL to a provider/model id or activate an authoring profile in /settings',
      );
    }
    model = createAiSdkGuideModel(modelId);
    return model;
  };

  return {
    async answer(request) {
      const document = await loadDocument(request.tourId);
      const guide = await resolveModel();
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
