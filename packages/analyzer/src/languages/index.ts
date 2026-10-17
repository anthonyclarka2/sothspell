import type { LanguageAnalyzer } from '../port.js';
import type { FileEntry, FileLanguage, LanguageId } from '../types.js';
import { goAnalyzer } from './go.js';
import { javaAnalyzer } from './java.js';
import { pythonAnalyzer } from './python.js';
import { rustAnalyzer } from './rust.js';
import { typescriptAnalyzer } from './typescript.js';

/**
 * The adapters the analyzer knows. Order is the tie-break order for detection
 * and for runtime loading, so it is stable and explicit rather than alphabetical.
 */
export const LANGUAGE_ANALYZERS: readonly LanguageAnalyzer[] = [
  typescriptAnalyzer,
  pythonAnalyzer,
  goAnalyzer,
  rustAnalyzer,
  javaAnalyzer,
];

export interface LanguageDetection {
  analyzer: LanguageAnalyzer;
  language: LanguageId;
}

const DETECTION_BY_FILE_LANGUAGE = new Map<FileLanguage, LanguageDetection>();
for (const analyzer of LANGUAGE_ANALYZERS) {
  for (const claim of analyzer.claims) {
    DETECTION_BY_FILE_LANGUAGE.set(claim.fileLanguage, {
      analyzer,
      language: claim.language,
    });
  }
}

/** The adapter and language id for a file language, or null when nothing parses it. */
export function detectionFor(fileLanguage: FileLanguage): LanguageDetection | null {
  return DETECTION_BY_FILE_LANGUAGE.get(fileLanguage) ?? null;
}

/** The detected language of a file, or null when the file is not source code. */
export function languageIdFor(fileLanguage: FileLanguage): LanguageId | null {
  return DETECTION_BY_FILE_LANGUAGE.get(fileLanguage)?.language ?? null;
}

/**
 * The adapters present in a file manifest, in registry order. Grammar-backed
 * adapters load their runtime only when their language is actually detected.
 */
export function detectedAnalyzers(files: FileEntry[]): LanguageAnalyzer[] {
  const present = new Set<LanguageId>();
  for (const file of files) {
    const language = languageIdFor(file.language);
    if (language) {
      present.add(language);
    }
  }
  return LANGUAGE_ANALYZERS.filter((analyzer) =>
    analyzer.claims.some((claim) => present.has(claim.language)),
  );
}

/**
 * The primary language of a project: the one with the most source bytes. Ties
 * are broken by language id so the choice is deterministic.
 */
export function primaryLanguage(files: FileEntry[]): LanguageId | null {
  const bytesByLanguage = new Map<LanguageId, number>();
  for (const file of files) {
    const language = languageIdFor(file.language);
    if (!language) {
      continue;
    }
    bytesByLanguage.set(language, (bytesByLanguage.get(language) ?? 0) + file.bytes);
  }

  let primary: LanguageId | null = null;
  let primaryBytes = -1;
  for (const [language, bytes] of [...bytesByLanguage].toSorted((left, right) =>
    left[0].localeCompare(right[0]),
  )) {
    if (bytes > primaryBytes) {
      primary = language;
      primaryBytes = bytes;
    }
  }
  return primary;
}
