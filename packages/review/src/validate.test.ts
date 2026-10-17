import { describe, expect, it } from 'vitest';
import { validateBeatEdit, validateEffectiveDocument, wordCount } from './validate.js';
import type { BeatEdit, BeatEditInput } from './schemas.js';
import { makeReviewDocument, NARRATION_TWO } from './test-fixtures.js';

function validInput(overrides: Partial<BeatEditInput> = {}): BeatEditInput {
  return {
    title: 'The overview, revised',
    narration: NARRATION_TWO,
    suggestedQuestions: ['What does the project do?'],
    diagramFocus: { diagramId: 'diagram_one', nodeIds: ['n_target'], edgeIds: [] },
    ...overrides,
  };
}

function contextFor(beatId = 'beat_one') {
  const document = makeReviewDocument();
  const chapter = document.chapters[0]!;
  return { document, chapter, beatId };
}

describe('beat edit validation', () => {
  it('accepts a well-formed edit', () => {
    const result = validateBeatEdit(validInput(), contextFor());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('reports schema violations against the field', () => {
    const result = validateBeatEdit(validInput({ narration: 'too short' }), contextFor());
    expect(result.errors).toContainEqual(expect.objectContaining({ field: 'narration' }));
    expect(result.errors[0]?.message).toMatch(/20 characters/);
  });

  it('refuses a title another beat in the chapter already uses', () => {
    const result = validateBeatEdit(
      validInput({ title: 'the entry point' }),
      contextFor(),
    );
    expect(result.errors).toContainEqual({
      field: 'title',
      message: 'another beat in this chapter is already titled "The entry point"',
    });
  });

  it('warns, but does not block, on an out-of-bound narration length', () => {
    const short = validateBeatEdit(
      validInput({ narration: 'Short but schema-valid narration text.' }),
      contextFor(),
    );
    expect(short.errors).toEqual([]);
    expect(short.warnings).toContainEqual(
      expect.objectContaining({ field: 'narration' }),
    );
  });

  it('refuses diagram focus that does not resolve in the chapter', () => {
    const result = validateBeatEdit(
      validInput({
        diagramFocus: {
          diagramId: 'diagram_one',
          nodeIds: ['m_one'],
          edgeIds: ['e_missing'],
        },
      }),
      contextFor(),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'diagramFocus.nodeIds' }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'diagramFocus.edgeIds' }),
    );
  });

  it('refuses focus on a diagram from another chapter', () => {
    const result = validateBeatEdit(
      validInput({
        diagramFocus: { diagramId: 'diagram_two', nodeIds: ['m_one'], edgeIds: [] },
      }),
      contextFor(),
    );
    expect(result.errors).toContainEqual({
      field: 'diagramFocus.diagramId',
      message: 'chapter "The shape of the project" has no diagram diagram_two',
    });
  });

  it('refuses node focus without a diagram', () => {
    const result = validateBeatEdit(
      validInput({
        diagramFocus: { diagramId: null, nodeIds: ['n_source'], edgeIds: [] },
      }),
      contextFor(),
    );
    expect(result.errors).toContainEqual({
      field: 'diagramFocus.diagramId',
      message: 'a diagram focus needs a diagram',
    });
  });

  it('counts words the same way the authoring pipeline does', () => {
    expect(wordCount('  one   two\nthree ')).toBe(3);
  });
});

describe('effective document validation', () => {
  it('accepts an edit the tour schema still allows', () => {
    const document = makeReviewDocument();
    const edit: BeatEdit = {
      id: 'edit_1',
      beatId: 'beat_one',
      source: 'manual',
      reviewer: 'local',
      createdAt: '2026-10-17T00:00:00.000Z',
      ...validInput(),
    };
    expect(validateEffectiveDocument(document, [edit])).toEqual([]);
  });

  it('rejects a stored edit whose focus leaves the chapter diagram', () => {
    const document = makeReviewDocument();
    // A legacy or corrupted record: the focus names a node from another
    // chapter. Field validation may miss it, but the tour schema cannot.
    const edit: BeatEdit = {
      id: 'edit_1',
      beatId: 'beat_one',
      source: 'manual',
      reviewer: 'local',
      createdAt: '2026-10-17T00:00:00.000Z',
      ...validInput(),
      diagramFocus: { diagramId: 'diagram_one', nodeIds: ['m_one'], edgeIds: [] },
    };
    const issues = validateEffectiveDocument(document, [edit]);
    expect(issues).toContainEqual(
      expect.objectContaining({
        message: expect.stringMatching(/focuses unknown node m_one/),
      }),
    );
  });
});
