export {
  BeatSchema,
  ChapterSchema,
  CodeAnchorSchema,
  SCHEMA_VERSION,
  SothspellDocumentSchema,
  StageSchema,
  parseSothspell,
  type Beat,
  type Chapter,
  type CodeAnchor,
  type ProjectRef,
  type Revision,
  type SothspellDocument,
  type Stage,
} from './schema.js';

export {
  compileSothspell,
  type CompileOptions,
  type CompiledAnchor,
  type CompiledBeat,
  type CompiledChapter,
  type CompiledStage,
  type CompiledTour,
} from './compiler.js';

export {
  hashText,
  languageForPath,
  readSourceRange,
  resolveContainedPath,
  type SourceRange,
} from './source.js';
