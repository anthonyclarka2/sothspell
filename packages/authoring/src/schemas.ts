import { z } from 'zod';
import { DiagramInstructionSchema } from '@sothspell/diagram';

export const AudienceSchema = z.enum([
  'new-contributor',
  'technical-evaluator',
  'maintainer',
]);

export const ChapterPlanSchema = z.object({
  title: z.string().min(2).max(96),
  summary: z.string().min(10).max(400),
  goal: z.string().min(10).max(300),
  beatBudget: z.number().int().min(2).max(5),
  coverage: z.array(z.string().min(1).max(120)).min(1).max(8),
});

export const TourPlanSchema = z.object({
  title: z.string().min(2).max(96),
  subtitle: z.string().min(2).max(160),
  audience: AudienceSchema,
  chapters: z.array(ChapterPlanSchema).min(3).max(8),
});

export const BeatDraftSchema = z.object({
  title: z.string().min(2).max(96),
  narration: z.string().min(20).max(1200),
  durationMs: z.number().int().min(4000).max(300000).optional(),
  anchorIds: z.array(z.string().min(1)).min(1).max(3),
  nodeIds: z.array(z.string().min(1)).max(16).optional(),
  edgeIds: z.array(z.string().min(1)).max(24).optional(),
  suggestedQuestions: z.array(z.string().min(4).max(240)).max(3).optional(),
});

export const ChapterDraftSchema = z.object({
  title: z.string().min(2).max(96),
  summary: z.string().min(10).max(400),
  diagram: DiagramInstructionSchema,
  beats: z.array(BeatDraftSchema).min(2).max(5),
});

export type ChapterPlan = z.infer<typeof ChapterPlanSchema>;
export type TourPlan = z.infer<typeof TourPlanSchema>;
export type BeatDraft = z.infer<typeof BeatDraftSchema>;
export type ChapterDraft = z.infer<typeof ChapterDraftSchema>;

export interface AuthoringQuality {
  planChapters: number;
  chapters: number;
  beats: number;
  anchors: number;
  droppedChapters: number;
  issues: string[];
  modelCalls: number;
  cacheHits: number;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  promptVersion: string;
  modelId: string;
  estimatedDurationMs: number;
}

export interface AuthoringResult {
  plan: TourPlan;
  document: import('@sothspell/core').SothspellDocument;
  quality: AuthoringQuality;
}
