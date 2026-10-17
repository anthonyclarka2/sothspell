import path from 'node:path';
import { hashText } from '@sothspell/core';
import type { z } from 'zod';
import {
  buildProjectBrief,
  type ProjectBrief,
  type ProjectSnapshot,
} from '@sothspell/analyzer';
import {
  ChapterDraftSchema,
  TourPlanSchema,
  type AuthoringQuality,
  type AuthoringResult,
  type ChapterDraft,
  type ChapterPlan,
  type TourPlan,
} from './schemas.js';
import { addUsage, type GuideModel, type ModelUsage } from './model.js';
import { loadPrompt, renderPrompt, PROMPT_VERSION } from './prompts.js';
import { buildContextPack, type ContextPack } from './context.js';
import { validateChapterDraft, validatePlan } from './validate.js';
import { assembleDocument, totalDurationMs } from './assemble.js';
import { AuthoringCache } from './cache.js';

export interface AuthoringProgress {
  stage: 'plan' | 'chapter' | 'repair' | 'assembled' | 'done';
  chapterIndex?: number;
  detail?: string;
}

export interface AuthorTourOptions {
  sourceRoot: string;
  audience?: TourPlan['audience'];
  maxMinutes?: number;
  cacheDirectory?: string;
  contextPack?: ContextPack;
  signal?: AbortSignal;
  maxRepairAttempts?: number;
  onProgress?: (progress: AuthoringProgress) => void;
}

export class AuthoringError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(issues.length > 0 ? `${message}: ${issues.join('; ')}` : message);
    this.name = 'AuthoringError';
    this.issues = issues;
  }
}

export interface ModelRunner {
  context: ContextPack;
  brief: ProjectBrief;
  model: GuideModel;
  cache: AuthoringCache | null;
  options: AuthorTourOptions;
  modelCalls: number;
  usage: ModelUsage;
  generateObject<T>(input: {
    schema: z.ZodType<T>;
    schemaName: string;
    prompt: string;
  }): Promise<T>;
}

function createModelRunner(
  snapshot: ProjectSnapshot,
  model: GuideModel,
  context: ContextPack,
  options: AuthorTourOptions,
): ModelRunner {
  const cache = options.cacheDirectory
    ? new AuthoringCache(path.join(options.cacheDirectory, 'llm'), PROMPT_VERSION)
    : null;

  const runner: ModelRunner = {
    context,
    brief: buildProjectBrief(snapshot),
    model,
    cache,
    options,
    modelCalls: 0,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    async generateObject<T>(input: {
      schema: z.ZodType<T>;
      schemaName: string;
      prompt: string;
    }): Promise<T> {
      const system = loadPrompt('system');
      const key = hashText(
        [model.id, PROMPT_VERSION, input.schemaName, system, input.prompt].join('\u0000'),
      );

      if (cache) {
        const cached = await cache.get<T>(key);
        if (cached !== null) {
          return cached;
        }
      }

      const result = await model.generateObject({
        schema: input.schema,
        schemaName: input.schemaName,
        system,
        prompt: input.prompt,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      runner.modelCalls += 1;
      runner.usage = addUsage(runner.usage, result.usage);
      if (cache) {
        await cache.set(key, result.value);
      }
      return result.value as T;
    },
  };

  return runner;
}

async function planTour(runner: ModelRunner): Promise<TourPlan> {
  runner.options.onProgress?.({ stage: 'plan' });
  const prompt = `${renderPrompt(loadPrompt('curriculum'), {
    brief: runner.context.brief,
  })}\nTarget runtime: ${runner.options.maxMinutes ?? 12} minutes.`;

  let plan: TourPlan;
  try {
    const raw = await runner.generateObject<unknown>({
      schema: TourPlanSchema,
      schemaName: 'TourPlan',
      prompt,
    });
    plan = TourPlanSchema.parse(raw);
  } catch (error) {
    throw new AuthoringError(
      `the model did not return a valid tour plan: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const issues = validatePlan(plan);
  if (issues.length > 0) {
    throw new AuthoringError('the tour plan did not pass validation', issues);
  }
  return runner.options.audience ? { ...plan, audience: runner.options.audience } : plan;
}

async function chapterDraft(
  runner: ModelRunner,
  plan: TourPlan,
  chapter: ChapterPlan,
  chapterIndex: number,
): Promise<ChapterDraft | null> {
  runner.options.onProgress?.({
    stage: 'chapter',
    chapterIndex,
    detail: chapter.title,
  });

  const prompt = renderPrompt(loadPrompt('chapter'), {
    plan,
    chapter,
    candidates: runner.context.candidates,
    docs: runner.context.docs,
  });

  let draft: ChapterDraft;
  try {
    const raw = await runner.generateObject<unknown>({
      schema: ChapterDraftSchema,
      schemaName: 'ChapterDraft',
      prompt,
    });
    draft = ChapterDraftSchema.parse(raw);
  } catch {
    // A malformed chapter is reported as dropped by the caller; the rest of the
    // tour can still be useful.
    return null;
  }

  let issues = validateChapterDraft(draft, chapter, runner.context.candidates);
  let attempts = 0;
  const maxAttempts = runner.options.maxRepairAttempts ?? 2;

  while (issues.length > 0 && attempts < maxAttempts) {
    attempts += 1;
    runner.options.onProgress?.({
      stage: 'repair',
      chapterIndex,
      detail: issues.join('; '),
    });
    const repairPrompt = renderPrompt(loadPrompt('repair'), {
      issues,
      draft,
      candidates: runner.context.candidates,
    });
    try {
      const repaired = await runner.generateObject<unknown>({
        schema: ChapterDraftSchema,
        schemaName: 'ChapterDraft',
        prompt: repairPrompt,
      });
      draft = ChapterDraftSchema.parse(repaired);
      issues = validateChapterDraft(draft, chapter, runner.context.candidates);
    } catch (error) {
      issues = [
        ...issues,
        `repair failed: ${error instanceof Error ? error.message : String(error)}`,
      ];
      break;
    }
  }

  if (issues.length > 0) {
    runner.options.onProgress?.({
      stage: 'repair',
      chapterIndex,
      detail: `dropped chapter after ${attempts} repair attempt(s)`,
    });
    return null;
  }

  return draft;
}

/**
 * Runs the authoring pipeline: plan the curriculum, write each chapter against
 * bounded evidence, validate and repair, then assemble the portable document.
 * The pipeline never writes to the project and never trusts a model-provided
 * file or line range.
 */
export async function authorTour(
  snapshot: ProjectSnapshot,
  model: GuideModel,
  options: AuthorTourOptions,
): Promise<AuthoringResult> {
  const brief = buildProjectBrief(snapshot);
  const context =
    options.contextPack ??
    (await buildContextPack(snapshot, brief, {
      sourceRoot: options.sourceRoot,
      maxCandidates: 60,
    }));

  const runner = createModelRunner(snapshot, model, context, options);
  const plan = await planTour(runner);
  const accepted: Array<{ plan: ChapterPlan; draft: ChapterDraft }> = [];
  const issues: string[] = [];
  let droppedChapters = 0;

  for (let index = 0; index < plan.chapters.length; index += 1) {
    const chapter = plan.chapters[index];
    if (!chapter) {
      continue;
    }
    const draft = await chapterDraft(runner, plan, chapter, index);
    if (draft === null || draft.beats.length === 0) {
      droppedChapters += 1;
      issues.push(`chapter "${chapter.title}" was dropped after validation`);
      continue;
    }
    accepted.push({ plan: chapter, draft });
  }

  if (accepted.length === 0) {
    throw new AuthoringError('no chapter passed validation', issues);
  }

  const document = assembleDocument({
    plan,
    chapters: accepted,
    candidates: context.candidates,
    snapshot,
  });

  const beats = document.chapters.flatMap((chapter) => chapter.beats);
  const quality: AuthoringQuality = {
    planChapters: plan.chapters.length,
    chapters: document.chapters.length,
    beats: beats.length,
    anchors: beats.reduce((total, beat) => total + beat.anchors.length, 0),
    droppedChapters,
    issues,
    modelCalls: runner.modelCalls,
    cacheHits: runner.cache?.hits ?? 0,
    usage: runner.usage,
    promptVersion: PROMPT_VERSION,
    modelId: model.id,
    estimatedDurationMs: totalDurationMs(document),
  };

  options.onProgress?.({ stage: 'assembled' });
  options.onProgress?.({ stage: 'done' });
  return { plan, document, quality };
}
