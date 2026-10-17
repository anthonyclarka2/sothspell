/**
 * The use cases of tiny-notes: adding, searching, archiving, removing, and
 * summarizing. The CLI and the HTTP API both call this seam, so validation and
 * tag normalization happen in exactly one place.
 */
import {
  NoteValidationError,
  type Note,
  type NoteDraft,
  type NoteQuery,
  type NoteSummary,
} from '../types.ts';
import type { NoteRepository } from './repository.ts';

export interface NoteService {
  add(draft: NoteDraft): Promise<Note>;
  search(query?: NoteQuery): Promise<Note[]>;
  get(id: string): Promise<Note>;
  archive(id: string): Promise<Note>;
  remove(id: string): Promise<Note>;
  summary(): Promise<NoteSummary>;
}

/** `now` is injectable so tests can keep archive timestamps deterministic. */
export interface ServiceOptions {
  now?: () => Date;
}

/** Lower-cases, trims, de-duplicates, and sorts tags so filters are stable. */
export function normalizeTags(tags: readonly string[]): string[] {
  const normalized = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
  return [...new Set(normalized)].toSorted();
}

function summarize(notes: readonly Note[]): NoteSummary {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const tag of note.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const tags = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .toSorted(
      (left, right) => right.count - left.count || left.tag.localeCompare(right.tag),
    );
  return {
    total: notes.length,
    active: notes.filter((note) => note.archivedAt === null).length,
    archived: notes.filter((note) => note.archivedAt !== null).length,
    tags,
  };
}

export function createNoteService(
  repository: NoteRepository,
  options: ServiceOptions = {},
): NoteService {
  const now = options.now ?? (() => new Date());

  return {
    async add(draft) {
      const title = draft.title.trim();
      if (title.length === 0) {
        throw new NoteValidationError('a note needs a title');
      }
      return repository.create({
        title,
        body: (draft.body ?? '').trim(),
        tags: normalizeTags(draft.tags ?? []),
      });
    },
    async search(query = {}) {
      const tag = query.tag === undefined ? undefined : normalizeTags([query.tag])[0];
      const text = query.text?.trim();
      return repository.list({
        includeArchived: query.includeArchived,
        tag,
        text: text === undefined || text.length === 0 ? undefined : text,
      });
    },
    get: (id) => repository.require(id),
    async archive(id) {
      const note = await repository.require(id);
      if (note.archivedAt !== null) {
        // Archiving twice keeps the original timestamp; the call is idempotent.
        return note;
      }
      const archived: Note = { ...note, archivedAt: now().toISOString() };
      await repository.save(archived);
      return archived;
    },
    remove: (id) => repository.remove(id),
    async summary() {
      return summarize(await repository.list({ includeArchived: true }));
    },
  };
}
