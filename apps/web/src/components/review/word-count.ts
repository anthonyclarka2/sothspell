/**
 * The authoring pipeline's narration bound, mirrored for the editor's inline
 * hint. The server is the authority; this only keeps the count visible while
 * the reviewer types.
 */
export const NARRATION_WORD_MIN = 30;
export const NARRATION_WORD_MAX = 180;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}
