import { useMemo, useState } from 'react';
import type { CompiledBeat, CompiledChapter } from '@sothspell/core';
import type { BeatEditPatch, ReviewIssue } from '../../lib/review-api.js';
import { wordCount } from './word-count.js';

interface BeatEditorProps {
  beat: CompiledBeat;
  chapter: CompiledChapter;
  busy: boolean;
  serverIssues: ReviewIssue[];
  onSave: (patch: BeatEditPatch) => void;
  onCancel: () => void;
}

interface FieldErrors {
  title?: string;
  narration?: string;
  questions?: string;
  focus?: string;
}

function validate(input: {
  title: string;
  narration: string;
  questions: string[];
  chapter: CompiledChapter;
  beatId: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const title = input.title.trim();
  if (title.length === 0) {
    errors.title = 'A beat needs a title.';
  } else if (title.length > 96) {
    errors.title = 'The title is limited to 96 characters.';
  } else if (
    input.chapter.beats.some(
      (beat) =>
        beat.id !== input.beatId &&
        beat.title.trim().toLowerCase() === title.toLowerCase(),
    )
  ) {
    errors.title = 'Another beat in this chapter already uses this title.';
  }

  const narration = input.narration.trim();
  if (narration.length < 20) {
    errors.narration = 'Narration needs at least 20 characters.';
  } else if (narration.length > 1200) {
    errors.narration = 'Narration is limited to 1200 characters.';
  }

  const questions = input.questions.map((question) => question.trim()).filter(Boolean);
  if (questions.length > 3) {
    errors.questions = 'A beat can suggest at most three questions.';
  } else if (questions.some((question) => question.length < 4 || question.length > 240)) {
    errors.questions = 'Each question must be between 4 and 240 characters.';
  }

  return errors;
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

/**
 * The beat editor. Editing is beat-scoped: the anchors are fixed evidence, and
 * the reviewer can change the words and the diagram focus. Validation runs
 * before the request and again on the server, so a failure always names the
 * field it belongs to.
 */
export function BeatEditor({
  beat,
  chapter,
  busy,
  serverIssues,
  onSave,
  onCancel,
}: BeatEditorProps) {
  const [title, setTitle] = useState(beat.title);
  const [narration, setNarration] = useState(beat.narration);
  const [questions, setQuestions] = useState<string[]>(
    beat.suggestedQuestions.length > 0 ? beat.suggestedQuestions : [''],
  );
  const [diagramId, setDiagramId] = useState<string | null>(beat.stage.diagramId ?? null);
  const [nodeIds, setNodeIds] = useState<string[]>([...beat.stage.nodeIds]);
  const [edgeIds, setEdgeIds] = useState<string[]>([...beat.stage.edgeIds]);
  const [errors, setErrors] = useState<FieldErrors>({});

  const diagram = chapter.diagrams.find((candidate) => candidate.id === diagramId);
  const words = wordCount(narration);

  const serverByField = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of serverIssues) {
      if (!map.has(issue.field)) {
        map.set(issue.field, issue.message);
      }
    }
    return map;
  }, [serverIssues]);

  function submit(): void {
    const next = validate({
      title,
      narration,
      questions,
      chapter,
      beatId: beat.id,
    });
    setErrors(next);
    if (Object.keys(next).length > 0) {
      return;
    }
    onSave({
      title: title.trim(),
      narration: narration.trim(),
      suggestedQuestions: questions.map((question) => question.trim()).filter(Boolean),
      diagramFocus: {
        diagramId,
        nodeIds,
        edgeIds,
      },
    });
  }

  const titleError = errors.title ?? serverByField.get('title');
  const narrationError = errors.narration ?? serverByField.get('narration');
  const questionsError = errors.questions ?? serverByField.get('suggestedQuestions');
  const focusError =
    errors.focus ??
    serverByField.get('diagramFocus.nodeIds') ??
    serverByField.get('diagramFocus.edgeIds') ??
    serverByField.get('diagramFocus.diagramId');

  return (
    <form
      className="review-form"
      aria-labelledby="review-editor-heading"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h3 id="review-editor-heading">Edit this beat</h3>
      <p className="field-hint">
        Anchors are fixed evidence and cannot be edited here; the words and the diagram
        focus can.
      </p>

      <div className="field">
        <label htmlFor="review-edit-title">Title</label>
        <input
          id="review-edit-title"
          value={title}
          maxLength={96}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? 'review-edit-title-error' : undefined}
          onChange={(event) => setTitle(event.target.value)}
        />
        {titleError && (
          <p className="field-error" id="review-edit-title-error">
            {titleError}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="review-edit-narration">Narration</label>
        <textarea
          id="review-edit-narration"
          rows={8}
          value={narration}
          aria-invalid={narrationError ? true : undefined}
          aria-describedby={
            narrationError ? 'review-edit-narration-error' : 'review-edit-narration-hint'
          }
          onChange={(event) => setNarration(event.target.value)}
        />
        <p className="field-hint" id="review-edit-narration-hint">
          {narration.trim().length} characters · {words} words
          {words < 30 || words > 180 ? ' · the authoring bound is 30–180 words' : ''}
        </p>
        {narrationError && (
          <p className="field-error" id="review-edit-narration-error">
            {narrationError}
          </p>
        )}
      </div>

      <fieldset className="review-fieldset">
        <legend>Suggested questions</legend>
        {questions.map((question, index) => (
          <div className="field" key={`question-${index}`}>
            <label htmlFor={`review-edit-question-${index}`}>Question {index + 1}</label>
            <input
              id={`review-edit-question-${index}`}
              value={question}
              maxLength={240}
              onChange={(event) =>
                setQuestions((current) =>
                  current.map((candidate, position) =>
                    position === index ? event.target.value : candidate,
                  ),
                )
              }
            />
          </div>
        ))}
        {questions.length < 3 && (
          <button
            type="button"
            className="secondary-action"
            onClick={() => setQuestions((current) => [...current, ''])}
          >
            Add a question
          </button>
        )}
        {questionsError && <p className="field-error">{questionsError}</p>}
      </fieldset>

      <fieldset className="review-fieldset">
        <legend>Diagram focus</legend>
        <div className="field">
          <label htmlFor="review-edit-diagram">Diagram</label>
          <select
            id="review-edit-diagram"
            value={diagramId ?? ''}
            onChange={(event) => {
              setDiagramId(event.target.value === '' ? null : event.target.value);
              setNodeIds([]);
              setEdgeIds([]);
            }}
          >
            <option value="">No diagram</option>
            {chapter.diagrams.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
        </div>

        {diagram && (
          <div className="review-focus">
            <div>
              <h4>Nodes</h4>
              {diagram.nodes.map((node) => (
                <label className="review-check" key={node.id}>
                  <input
                    type="checkbox"
                    checked={nodeIds.includes(node.id)}
                    onChange={() => setNodeIds((current) => toggle(current, node.id))}
                  />
                  {node.label}
                </label>
              ))}
            </div>
            <div>
              <h4>Edges</h4>
              {diagram.edges.length === 0 && <p className="field-hint">No edges.</p>}
              {diagram.edges.map((edge) => (
                <label className="review-check" key={edge.id}>
                  <input
                    type="checkbox"
                    checked={edgeIds.includes(edge.id)}
                    onChange={() => setEdgeIds((current) => toggle(current, edge.id))}
                  />
                  {edge.from} → {edge.to}
                </label>
              ))}
            </div>
          </div>
        )}
        {focusError && <p className="field-error">{focusError}</p>}
      </fieldset>

      <div className="review-form-actions">
        <button type="submit" className="primary-action" disabled={busy}>
          Save beat
        </button>
        <button
          type="button"
          className="secondary-action"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
