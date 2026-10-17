/**
 * Rendering for the CLI. Formatting is separate from the service so output
 * choices never leak into use cases, and so tests can assert on stable text.
 */
import type { Note, NoteSummary } from '../types.ts';

/** One note as a Markdown block with a stable field order. */
export function formatNote(note: Note): string {
  const lines = [`## ${note.title}`, '', note.body.length > 0 ? note.body : '_(no body)_', ''];
  if (note.tags.length > 0) {
    lines.push(`Tags: ${note.tags.join(', ')}`);
  }
  lines.push(`Created: ${note.createdAt}`);
  if (note.archivedAt !== null) {
    lines.push(`Archived: ${note.archivedAt}`);
  }
  lines.push(`Id: ${note.id}`);
  return lines.join('\n');
}

/** A list view: one line per note, or a placeholder when nothing matches. */
export function formatNoteList(notes: readonly Note[]): string {
  if (notes.length === 0) {
    return 'No notes.';
  }
  return notes
    .map((note) => {
      const tags = note.tags.length > 0 ? ` #${note.tags.join(' #')}` : '';
      const archived = note.archivedAt === null ? '' : ' [archived]';
      return `${note.id}  ${note.title}${tags}${archived}`;
    })
    .join('\n');
}

/** The summary view: counts plus a tag histogram ordered by frequency. */
export function formatSummary(summary: NoteSummary): string {
  const lines = [
    `Notes: ${summary.total} total, ${summary.active} active, ${summary.archived} archived`,
  ];
  if (summary.tags.length === 0) {
    lines.push('Tags: none');
  } else {
    lines.push('Tags:');
    for (const { tag, count } of summary.tags) {
      lines.push(`  ${tag} (${count})`);
    }
  }
  return lines.join('\n');
}
