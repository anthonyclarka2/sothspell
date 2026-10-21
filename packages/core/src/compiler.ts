import { layoutDiagram, type PositionedDiagram } from '@sothspell/diagram';
import {
  applyTranslation,
  parseSothspell,
  sourceLocaleOf,
  type Beat,
  type CodeAnchor,
  type SothspellDocument,
} from './schema.js';
import { hashText, languageForPath, readSourceRange } from './source.js';
import { highlightCodeLines } from './highlight.js';

export interface CompiledAnchor {
  id: string;
  path: string;
  symbol?: string;
  /** The analyzer symbol ID this anchor targets, when the tour carries one. */
  symbolId?: string;
  label?: string;
  startLine: number;
  endLine: number;
  language: string;
  contentHash: string;
  excerpt: string;
  html: string;
}

export interface CompiledStage {
  anchorIds: string[];
  diagramId?: string;
  nodeIds: string[];
  edgeIds: string[];
}

export interface CompiledBeat {
  id: string;
  title: string;
  narration: string;
  durationMs: number;
  anchors: CompiledAnchor[];
  stage: CompiledStage;
  suggestedQuestions: string[];
}

export interface CompiledChapter {
  id: string;
  title: string;
  summary: string;
  diagrams: PositionedDiagram[];
  beats: CompiledBeat[];
}

export interface CompiledTour {
  schemaVersion: string;
  id: string;
  title: string;
  subtitle: string;
  audience: SothspellDocument['audience'];
  project: SothspellDocument['project'];
  /** The locale this rendering is in. */
  locale: string;
  /** The locale the tour was authored in. */
  sourceLocale: string;
  /** Source locale plus every locale with a translation. */
  availableLocales: string[];
  estimatedDurationMs: number;
  chapters: CompiledChapter[];
}

export interface CompileOptions {
  /** When an anchor has no embedded excerpt, read it from this read-only root. */
  sourceRoot?: string;
  /**
   * The locale to render. When it has no translation the source locale is
   * compiled instead; the compiled tour always reports the locale it used.
   */
  locale?: string;
}

function estimateDurationMs(narration: string): number {
  const words = narration.trim().split(/\s+/u).filter(Boolean).length;
  const seconds = words / 2.5;
  return Math.max(6000, Math.round(seconds * 1000));
}

async function resolveAnchor(
  anchor: CodeAnchor,
  options: CompileOptions,
): Promise<CompiledAnchor> {
  let excerpt = anchor.excerpt;

  if (excerpt === undefined) {
    if (!options.sourceRoot) {
      throw new Error(
        `anchor ${anchor.id} has no embedded excerpt and no source root was provided`,
      );
    }
    const range = await readSourceRange(
      options.sourceRoot,
      anchor.path,
      anchor.lines.start,
      anchor.lines.end,
    );
    excerpt = range.text;
  }

  const actualHash = hashText(excerpt);
  if (actualHash !== anchor.contentHash) {
    throw new Error(
      `anchor ${anchor.id} hash mismatch: expected ${anchor.contentHash}, got ${actualHash}`,
    );
  }

  const language = anchor.language ?? languageForPath(anchor.path);
  const highlighted = await highlightCodeLines(excerpt, language, {
    startLine: 1,
    endLine: excerpt.split('\n').length,
  });
  const html = highlighted.html;

  return {
    id: anchor.id,
    path: anchor.path,
    startLine: anchor.lines.start,
    endLine: anchor.lines.end,
    language,
    contentHash: actualHash,
    excerpt,
    html,
    ...(anchor.symbol === undefined ? {} : { symbol: anchor.symbol }),
    ...(anchor.symbolId === undefined ? {} : { symbolId: anchor.symbolId }),
    ...(anchor.label === undefined ? {} : { label: anchor.label }),
  };
}

async function compileBeat(beat: Beat, options: CompileOptions): Promise<CompiledBeat> {
  const anchors = await Promise.all(
    beat.anchors.map((anchor) => resolveAnchor(anchor, options)),
  );

  return {
    id: beat.id,
    title: beat.title,
    narration: beat.narration,
    durationMs: beat.durationMs ?? estimateDurationMs(beat.narration),
    anchors,
    stage: {
      anchorIds: [...beat.stage.anchorIds],
      ...(beat.stage.diagramId === undefined ? {} : { diagramId: beat.stage.diagramId }),
      nodeIds: [...(beat.stage.nodeIds ?? [])],
      edgeIds: [...(beat.stage.edgeIds ?? [])],
    },
    suggestedQuestions: [...(beat.suggestedQuestions ?? [])],
  };
}

/**
 * Turns a validated Sóþspell into everything the player and the code browser
 * need: resolved excerpts with highlighted HTML, deterministic diagram
 * positions, and beat durations. The compiler is the only place that reads
 * source; the player never touches the filesystem.
 *
 * When a locale is requested, the matching translation is overlaid before
 * compilation. Anchors and ids are copied from the source untouched, so a
 * translated tour cites exactly the same evidence.
 */
export async function compileSothspell(
  input: unknown,
  options: CompileOptions = {},
): Promise<CompiledTour> {
  const document = parseSothspell(input);
  const sourceLocale = sourceLocaleOf(document);
  const availableLocales = [sourceLocale, ...Object.keys(document.translations ?? {})];
  const requested = options.locale;
  const locale =
    requested !== undefined &&
    requested !== sourceLocale &&
    document.translations?.[requested]
      ? requested
      : sourceLocale;
  const rendered =
    locale === sourceLocale ? document : applyTranslation(document, locale);

  const chapters = await Promise.all(
    rendered.chapters.map(async (chapter) => {
      const [diagrams, beats] = await Promise.all([
        Promise.all(chapter.diagrams.map((diagram) => layoutDiagram(diagram))),
        Promise.all(chapter.beats.map((beat) => compileBeat(beat, options))),
      ]);

      return {
        id: chapter.id,
        title: chapter.title,
        summary: chapter.summary,
        diagrams,
        beats,
      } satisfies CompiledChapter;
    }),
  );

  const estimatedDurationMs = chapters
    .flatMap((chapter) => chapter.beats)
    .reduce((total, beat) => total + beat.durationMs, 0);

  return {
    schemaVersion: rendered.schemaVersion,
    id: rendered.id,
    title: rendered.title,
    subtitle: rendered.subtitle,
    audience: rendered.audience,
    project: rendered.project,
    locale,
    sourceLocale,
    availableLocales,
    estimatedDurationMs,
    chapters,
  };
}
