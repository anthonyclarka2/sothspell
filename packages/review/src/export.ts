import type { SothspellDocument } from '@sothspell/core';
import { effectiveBeat, findBeat } from './edits.js';
import { type AnchorCheck, type ReviewQuality, type ReviewSession } from './schemas.js';

/**
 * The review report. Markdown is the human artifact (decisions, comments,
 * edits, regenerations, anchors, quality); JSON is the machine record for
 * tooling. Neither contains a secret: the review record never stores one.
 */

export interface ReviewReportContext {
  document: SothspellDocument;
  quality: ReviewQuality | null;
  /** Fresh anchor checks, when the caller has them; otherwise decisions carry them. */
  anchors?: AnchorCheck[];
}

function beatLabel(document: SothspellDocument, beatId: string | null): string {
  if (beatId === null) {
    return 'Tour-level';
  }
  const located = findBeat(document, beatId);
  return located ? `${located.beat.title} (${beatId})` : beatId;
}

function formatList(items: string[]): string {
  return items.length === 0 ? 'none' : items.join(', ');
}

function anchorSection(checks: AnchorCheck[]): string[] {
  if (checks.length === 0) {
    return ['No anchor checks were recorded.'];
  }
  const lines = [
    '| Anchor | Beat | Path | Status | Detail |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const check of checks) {
    lines.push(
      `| ${check.anchorId} | ${check.beatId} | ${check.path} | ${check.status} | ${check.detail} |`,
    );
  }
  return lines;
}

function qualitySection(quality: ReviewQuality | null): string[] {
  if (!quality) {
    return ['No quality report was stored beside this tour.'];
  }
  return [
    `- Chapters: ${quality.chapters} of ${quality.planChapters} planned`,
    `- Beats: ${quality.beats}, anchors: ${quality.anchors}`,
    `- Dropped chapters: ${quality.droppedChapters}`,
    `- Issues: ${formatList(quality.issues)}`,
    `- Model: ${quality.modelId}${quality.profileName ? ` (profile ${quality.profileName})` : ''}`,
    `- Model calls: ${quality.modelCalls}, cache hits: ${quality.cacheHits}`,
    `- Prompt version: ${quality.promptVersion}`,
    `- Estimated duration: ${quality.estimatedDurationMs} ms`,
  ];
}

export function renderReviewReportMarkdown(
  session: ReviewSession,
  context: ReviewReportContext,
): string {
  const { document, quality } = context;
  const lines: string[] = [
    `# Review report — ${document.title}`,
    '',
    `- Review: ${session.id}`,
    `- Tour: ${session.tourId}`,
    `- Tour revision: ${session.tourRevision}`,
    `- Project revision: ${document.project.revision.commit}${
      document.project.revision.dirty ? ' (dirty)' : ''
    }`,
    `- Reviewer: ${session.reviewer}`,
    `- State: ${session.state}`,
    `- Started: ${session.createdAt}`,
    `- Updated: ${session.updatedAt}`,
    '',
    '## Decisions',
    '',
  ];

  if (session.decisions.length === 0) {
    lines.push('No decision has been recorded.');
  }
  for (const decision of session.decisions) {
    lines.push(`### ${decision.kind} — ${decision.reviewer} · ${decision.decidedAt}`, '');
    lines.push(`- Reason: ${decision.reason ?? 'not recorded'}`);
    if (decision.qualityOverride) {
      lines.push(
        '- Quality override: the reviewer approved over a quality report that flagged concerns',
      );
    }
    if (decision.anchorVerification) {
      const failed = decision.anchorVerification.checks.filter(
        (check) => check.status !== 'verified',
      );
      lines.push(
        `- Anchor verification: ${decision.anchorVerification.checks.length - failed.length}/${decision.anchorVerification.checks.length} verified at ${decision.anchorVerification.checkedAt}`,
      );
    }
    lines.push('');
  }

  lines.push('## Anchor verification', '');
  const checks =
    context.anchors ?? session.decisions.at(-1)?.anchorVerification?.checks ?? [];
  lines.push(...anchorSection(checks), '');

  lines.push('## Comments', '');
  if (session.comments.length === 0) {
    lines.push('No comments were recorded.');
  }
  for (const comment of session.comments) {
    lines.push(`### ${beatLabel(document, comment.beatId)}`, '');
    lines.push(`**${comment.author}** · ${comment.createdAt}`, '');
    lines.push(...comment.body.split('\n').map((line) => `> ${line}`));
    lines.push('');
  }

  lines.push('## Beat edits', '');
  if (session.edits.length === 0) {
    lines.push('No beats were edited.');
  }
  for (const edit of session.edits) {
    const located = findBeat(document, edit.beatId);
    lines.push(`### ${located?.beat.title ?? edit.beatId} (${edit.beatId})`, '');
    lines.push(
      `- ${edit.source} edit by ${edit.reviewer} at ${edit.createdAt}`,
      `- Title: ${edit.title}`,
      `- Diagram focus: ${edit.diagramFocus.diagramId ?? 'none'}; nodes ${formatList(
        edit.diagramFocus.nodeIds,
      )}; edges ${formatList(edit.diagramFocus.edgeIds)}`,
      `- Suggested questions: ${formatList(edit.suggestedQuestions)}`,
      '',
    );
    lines.push(...edit.narration.split('\n').map((line) => `> ${line}`), '');
  }

  lines.push('## Regenerations', '');
  if (session.regenerations.length === 0) {
    lines.push('No beats were regenerated.');
  }
  for (const regeneration of session.regenerations) {
    lines.push(`### ${beatLabel(document, regeneration.beatId)}`, '');
    lines.push(
      `- Model: ${regeneration.modelId} · generated ${regeneration.createdAt}`,
      `- Status: ${regeneration.revertedAt ? `reverted at ${regeneration.revertedAt}` : 'applied'}`,
      '',
      'Previous narration:',
      '',
      ...regeneration.previous.narration.split('\n').map((line) => `> ${line}`),
      '',
      'Generated narration:',
      '',
      ...regeneration.generated.narration.split('\n').map((line) => `> ${line}`),
      '',
    );
  }

  lines.push('## Quality report', '', ...qualitySection(quality), '');

  return `${lines.join('\n').trimEnd()}\n`;
}

export interface ReviewReportJson {
  formatVersion: 1;
  review: ReviewSession;
  tour: {
    id: string;
    title: string;
    subtitle: string;
    project: string;
    revision: { commit: string; branch: string | null; dirty: boolean };
    revisionHash: string;
  };
  quality: ReviewQuality | null;
  anchors: AnchorCheck[];
  effectiveBeats: Array<{
    beatId: string;
    title: string;
    narration: string;
    suggestedQuestions: string[];
    diagramFocus: {
      diagramId: string | null;
      nodeIds: string[];
      edgeIds: string[];
    };
    edited: boolean;
  }>;
}

export function renderReviewReportJson(
  session: ReviewSession,
  context: ReviewReportContext,
): string {
  const { document, quality } = context;
  const effectiveBeats: ReviewReportJson['effectiveBeats'] = [];

  for (const chapter of document.chapters) {
    for (const beat of chapter.beats) {
      const current = effectiveBeat(document, session.edits, beat.id) ?? beat;
      effectiveBeats.push({
        beatId: beat.id,
        title: current.title,
        narration: current.narration,
        suggestedQuestions: [...(current.suggestedQuestions ?? [])],
        diagramFocus: {
          diagramId: current.stage.diagramId ?? null,
          nodeIds: [...(current.stage.nodeIds ?? [])],
          edgeIds: [...(current.stage.edgeIds ?? [])],
        },
        edited: current !== beat,
      });
    }
  }

  const report: ReviewReportJson = {
    formatVersion: 1,
    review: session,
    tour: {
      id: document.id,
      title: document.title,
      subtitle: document.subtitle,
      project: document.project.slug,
      revision: document.project.revision,
      revisionHash: session.tourRevision,
    },
    quality,
    anchors: context.anchors ?? [],
    effectiveBeats,
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}
