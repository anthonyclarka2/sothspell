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
  sourceRoot: string | null;
  resolveSourceRoot?: (tourId: string, projectSlug: string) => Promise<string | null>;
  modelId?: string | null;
  model?: GuideModel;
  /**
   * Profile-aware resolution seam; see `createAskService`. A null result keeps
   * the existing `modelId`/`SOTHSPELL_MODEL` fallback.
   */
  resolveModel?: () => Promise<GuideModel | null>;
}

export function createDrilldownService(
  options: CreateDrilldownServiceOptions,
): DrilldownService {
  const documents = new Map<string, Promise<SothspellDocument>>();
  const snapshots = new Map<string, ReturnType<typeof analyzeProject>>();
  let model: GuideModel | null = options.model ?? null;

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
        'no model configured for drilldown; set SOTHSPELL_MODEL to a provider/model id or activate an authoring profile in /settings',
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
      const document = await loadDocument(tourId);
      const guide = await resolveModel();
      const sourceRoot = await (options.resolveSourceRoot?.(
        tourId,
        document.project.slug,
      ) ?? Promise.resolve(options.sourceRoot));
      if (sourceRoot === null) {
        throw new AskUnavailableError('drilldown needs a project source root');
      }
      let snapshot = snapshots.get(sourceRoot);
      if (!snapshot) {
        snapshot = analyzeProject(sourceRoot);
        snapshots.set(sourceRoot, snapshot);
        snapshot.catch(() => snapshots.delete(sourceRoot));
      }
      return generateDrilldown({
        tour: document,
        anchorId,
        snapshot: await snapshot,
        sourceRoot,
        model: guide,
      });
    },
  };
}
