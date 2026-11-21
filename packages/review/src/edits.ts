import type { Beat, Chapter, SothspellDocument } from '@sothspell/core';
import type { BeatEdit, BeatSnapshot } from './schemas.js';

/**
 * Edits are stored in the review record, never written into the tour artifact:
 * "it never changes the sóþspell silently". The effective document is the tour
 * plus the latest edit per beat, and it is what the reviewer reads, what the
 * approval gate verifies, and what the export describes.
 */

export interface LocatedBeat {
  chapter: Chapter;
  beat: Beat;
}

export function findBeat(
  document: SothspellDocument,
  beatId: string,
): LocatedBeat | null {
  for (const chapter of document.chapters) {
    const beat = chapter.beats.find((candidate) => candidate.id === beatId);
    if (beat) {
      return { chapter, beat };
    }
  }
  return null;
}

/** The latest edit for a beat; later records win. */
export function latestEdit(edits: BeatEdit[], beatId: string): BeatEdit | null {
  for (let index = edits.length - 1; index >= 0; index -= 1) {
    const edit = edits[index];
    if (edit && edit.beatId === beatId) {
      return edit;
    }
  }
  return null;
}

export function snapshotFromBeat(beat: Beat): BeatSnapshot {
  return {
    title: beat.title,
    narration: beat.narration,
    suggestedQuestions: [...(beat.suggestedQuestions ?? [])],
    ...(beat.learningCheck
      ? {
          learningCheck: {
            prompt: beat.learningCheck.prompt,
            explanation: beat.learningCheck.explanation,
          },
        }
      : {}),
    diagramFocus: {
      diagramId: beat.stage.diagramId ?? null,
      nodeIds: [...(beat.stage.nodeIds ?? [])],
      edgeIds: [...(beat.stage.edgeIds ?? [])],
    },
  };
}

/** The beat as the reviewer currently sees it: the tour beat plus any edit. */
export function effectiveBeat(
  document: SothspellDocument,
  edits: BeatEdit[],
  beatId: string,
): Beat | null {
  const located = findBeat(document, beatId);
  if (!located) {
    return null;
  }
  const edit = latestEdit(edits, beatId);
  return edit ? applyEdit(located.beat, edit) : located.beat;
}

export function effectiveBeatSnapshot(
  document: SothspellDocument,
  edits: BeatEdit[],
  beatId: string,
): BeatSnapshot | null {
  const beat = effectiveBeat(document, edits, beatId);
  return beat ? snapshotFromBeat(beat) : null;
}

function applyEdit(beat: Beat, edit: BeatEdit): Beat {
  return {
    ...beat,
    title: edit.title,
    narration: edit.narration,
    // The edit changed the words; the compiler re-estimates the duration
    // rather than playing the old recording's timing over new narration.
    durationMs: undefined,
    stage: {
      anchorIds: [...beat.stage.anchorIds],
      diagramId: edit.diagramFocus.diagramId ?? undefined,
      nodeIds: [...edit.diagramFocus.nodeIds],
      edgeIds: [...edit.diagramFocus.edgeIds],
    },
    suggestedQuestions:
      edit.suggestedQuestions.length > 0 ? [...edit.suggestedQuestions] : undefined,
    ...(edit.learningCheck === null
      ? { learningCheck: undefined }
      : edit.learningCheck && beat.learningCheck
        ? {
            learningCheck: {
              ...beat.learningCheck,
              prompt: edit.learningCheck.prompt,
              explanation: edit.learningCheck.explanation,
            },
          }
        : {}),
  };
}

/** The tour document with every beat edit applied. */
export function applyBeatEdits(
  document: SothspellDocument,
  edits: BeatEdit[],
): SothspellDocument {
  if (edits.length === 0) {
    return document;
  }

  const checksChanged = new Set<string>();
  const chapters = document.chapters.map((chapter) => ({
    ...chapter,
    beats: chapter.beats.map((beat) => {
      const edit = latestEdit(edits, beat.id);
      const updated = edit ? applyEdit(beat, edit) : beat;
      if (
        updated.learningCheck?.prompt !== beat.learningCheck?.prompt ||
        updated.learningCheck?.explanation !== beat.learningCheck?.explanation
      ) {
        checksChanged.add(beat.id);
      }
      return updated;
    }),
  }));
  if (!document.translations || checksChanged.size === 0) {
    return { ...document, chapters };
  }

  // Edited or removed checks fall back to their current source text until
  // translated again. Unrelated text keeps its existing translations.
  const translations = Object.fromEntries(
    Object.entries(document.translations).map(([locale, translation]) => [
      locale,
      {
        ...translation,
        chapters: translation.chapters.map((chapter) => ({
          ...chapter,
          beats: chapter.beats.map((beat) =>
            checksChanged.has(beat.id) ? { ...beat, learningCheck: undefined } : beat,
          ),
        })),
      },
    ]),
  );
  return { ...document, chapters, translations };
}
