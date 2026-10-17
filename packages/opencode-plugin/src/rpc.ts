import { Rpc } from '@opencode/plugin/rpc';
import { z } from 'zod';

/**
 * The public seam between Sóþspell and every OpenCode client. The definitions
 * stay free of runtime imports so another plugin or the web app can import
 * `@sothspell/opencode-plugin/rpc` without loading authoring dependencies.
 */

export const RunSummarySchema = z.object({
  beatId: z.string().min(1),
  completed: z.number().int().min(0),
});

export const StatusOutputSchema = z.object({
  projectRoot: z.string().min(1),
  tourId: z.string().min(1).nullable(),
  playerUrl: z.string().min(1),
  run: RunSummarySchema.nullable(),
});

export const OpenOutputSchema = z.object({
  playerUrl: z.string().min(1),
});

export const GenerateInputSchema = z.object({
  maxMinutes: z.number().int().min(1).max(120).optional(),
});

export const GenerateOutputSchema = z.object({
  tourId: z.string().min(1),
  playerUrl: z.string().min(1),
  quality: z.unknown(),
});

export const ProgressOutputSchema = z.object({
  run: z.unknown().nullable(),
});

export const AskInputSchema = z.object({
  question: z.string().trim().min(3).max(2000),
  beatId: z.string().min(1).max(128).optional(),
});

export const AskOutputSchema = z.object({
  answer: z.unknown(),
});

export const CancelOutputSchema = z.object({
  ok: z.boolean(),
});

export const GenerationProgressSchema = z.object({
  stage: z.string().min(1),
  chapterIndex: z.number().int().min(0).optional(),
  detail: z.string().optional(),
});

export const RunUpdatedSchema = z.object({
  tourId: z.string().min(1).nullable(),
  beatId: z.string().min(1).nullable(),
  completed: z.number().int().min(0),
});

export const SothspellRpc = Rpc.define({
  id: 'sothspell',
  methods: {
    status: {
      input: z.object({}),
      output: StatusOutputSchema,
    },
    open: {
      input: z.object({}),
      output: OpenOutputSchema,
    },
    generate: {
      input: GenerateInputSchema,
      output: GenerateOutputSchema,
      errors: {
        generation_running: z.object({ message: z.string().min(1) }),
      },
    },
    progress: {
      input: z.object({}),
      output: ProgressOutputSchema,
    },
    ask: {
      input: AskInputSchema,
      output: AskOutputSchema,
      errors: {
        no_tour: z.object({ message: z.string().min(1) }),
      },
    },
    cancel: {
      input: z.object({}),
      output: CancelOutputSchema,
    },
  },
  events: {
    'generation.progress': {
      schema: GenerationProgressSchema,
    },
    'run.updated': {
      schema: RunUpdatedSchema,
    },
  },
});

export type SothspellStatusOutput = z.infer<typeof StatusOutputSchema>;
export type SothspellGenerateOutput = z.infer<typeof GenerateOutputSchema>;
export type SothspellAskOutput = z.infer<typeof AskOutputSchema>;
