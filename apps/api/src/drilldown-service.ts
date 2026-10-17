import { readFile } from 'node:fs/promises';
import { parseSothspell, type SothspellDocument } from '@sothspell/core';
import { analyzeProject } from '@sothspell/analyzer';
import {
  createAiSdkGuideModel,
  generateDrilldown,
  type DrilldownResult,
  type GuideModel,
} from '@sothspell/authoring';
import { AskUnavailableError } from './ask-service.js';

export interface DrilldownService {
  generate(tourId: string, anchorId: string): Promise<DrilldownResult>;
}

export interface CreateDrilldownServiceOptions {
  resolveTourPath: (tourId: string) => Promise<string | null>;
  sourceRoot: string;
  modelId?: string | null;
  model?: GuideModel;
}

export function createDrilldownService(
  options: CreateDrilldownServiceOptions,
): DrilldownService {
  const documents = new Map<string, Promise<SothspellDocument>>();
  let snapshotPromise: ReturnType<typeof analyzeProject> | null = null;
  let model: GuideModel | null = options.model ?? null;

  const resolveModel = (): GuideModel => {
    if (model) {
      return model;
    }
    const modelId = options.modelId ?? process.env.SOTHSPELL_MODEL ?? null;
    if (!modelId || modelId === 'fixture' || modelId === 'fake') {
      throw new AskUnavailableError(
        'no model configured for drilldown; set SOTHSPELL_MODEL to a provider/model id',
      );
    }
    model = createAiSdkGuideModel(modelId);
    return model;
  };

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

  return {
    async generate(tourId, anchorId) {
      snapshotPromise ??= analyzeProject(options.sourceRoot);
      const [document, snapshot] = await Promise.all([
        loadDocument(tourId),
        snapshotPromise,
      ]);
      return generateDrilldown({
        tour: document,
        anchorId,
        snapshot,
        sourceRoot: options.sourceRoot,
        model: resolveModel(),
      });
    },
  };
}
