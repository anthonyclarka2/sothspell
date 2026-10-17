export {
  addUsage,
  normalizeUsage,
  type GenerateObjectInput,
  type GenerateTextInput,
  type GuideModel,
  type ModelUsage,
} from './model.js';

export {
  FakeGuideModel,
  type FakeModelRequest,
  type FakeModelResponder,
} from './fake-model.js';
export { createFixtureGuideModel } from './fixture-model.js';
export { createAiSdkGuideModel } from './ai-sdk-model.js';

export {
  AudienceSchema,
  BeatDraftSchema,
  ChapterDraftSchema,
  ChapterPlanSchema,
  TourPlanSchema,
  type AuthoringQuality,
  type AuthoringResult,
  type BeatDraft,
  type ChapterDraft,
  type ChapterPlan,
  type TourPlan,
} from './schemas.js';

export {
  authorTour,
  AuthoringError,
  type AuthoringProgress,
  type AuthorTourOptions,
} from './author.js';

export {
  buildContextPack,
  type AnchorCandidate,
  type BuildContextOptions,
  type ContextPack,
} from './context.js';

export { AuthoringCache } from './cache.js';
export {
  answerQuestion,
  AskAnswerSchema,
  mergeUsage,
  type AskAnswer,
  type AskHistoryEntry,
  type AskQuestionInput,
  type AskQuestionResult,
} from './ask.js';
export { assembleDocument, totalDurationMs } from './assemble.js';
export { loadPrompt, renderPrompt, PROMPT_VERSION } from './prompts.js';
export { validateChapterDraft, validatePlan } from './validate.js';
