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
  generate(anchorId: string): Promise<DrilldownResult>;
}

export interface CreateDrilldownServiceOptions {
  tourJsonPath: string;
  sourceRoot: string;
  modelId?: string | null;
  model?: GuideModel;
}

export function createDrilldownService(
  options: CreateDrilldownServiceOptions,
): DrilldownService {
  let documentPromise: Promise<SothspellDocument> | null = null;
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

  return {
    async generate(anchorId) {
      documentPromise ??= readFile(options.tourJsonPath, 'utf8').then((raw) =>
        parseSothspell(JSON.parse(raw) as unknown),
      );
      snapshotPromise ??= analyzeProject(options.sourceRoot);
      const [document, snapshot] = await Promise.all([
        documentPromise,
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
