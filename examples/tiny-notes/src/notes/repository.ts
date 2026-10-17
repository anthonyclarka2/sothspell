/**
 * Note persistence. The repository owns the on-disk document shape and the
 * ordering rules; the service owns use cases. Keeping the two apart means the
 * storage format can change without touching user-facing behavior.
 */
import { randomUUID } from 'node:crypto';
import type { JsonStore } from '../storage/file-store.ts';
import { NoteNotFoundError, type Note, type NoteDraft, type NoteQuery } from '../types.ts';

/** The exact JSON document stored on disk. */
export interface NotesDocument {
  notes: Note[];
}

export interface NoteRepository {
  create(draft: NoteDraft): Promise<Note>;
  list(query?: NoteQuery): Promise<Note[]>;
  find(id: string): Promise<Note | null>;
  require(id: string): Promise<Note>;
  save(note: Note): Promise<void>;
  remove(id: string): Promise<Note>;
}

/** `newId` and `now` are injectable so tests can be deterministic. */
export interface RepositoryOptions {
  newId?: () => string;
  now?: () => Date;
}

function matchesQuery(note: Note, query: NoteQuery): boolean {
  if (note.archivedAt !== null && query.includeArchived !== true) {
    return false;
  }
  if (query.tag !== undefined && !note.tags.includes(query.tag)) {
    return false;
  }
  const haystack = `${note.title}\n${note.body}`.toLowerCase();
  return query.text === undefined || haystack.includes(query.text.toLowerCase());
}

/** Newest first; ties break on id so the order is always deterministic. */
function byRecency(left: Note, right: Note): number {
  return right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id);
}

export function createNoteRepository(
  store: JsonStore<NotesDocument>,
  options: RepositoryOptions = {},
): NoteRepository {
  const newId = options.newId ?? randomUUID;
  const now = options.now ?? (() => new Date());
  const readNotes = async (): Promise<Note[]> => (await store.read()).notes;
  const find = async (id: string): Promise<Note | null> =>
    (await readNotes()).find((note) => note.id === id) ?? null;

  return {
    async create(draft) {
      const note: Note = {
        id: newId(),
        title: draft.title,
        body: draft.body ?? '',
        tags: draft.tags ?? [],
        createdAt: now().toISOString(),
        archivedAt: null,
      };
      await store.write({ notes: [...(await readNotes()), note] });
      return note;
    },
    async list(query = {}) {
      return (await readNotes()).filter((note) => matchesQuery(note, query)).toSorted(byRecency);
    },
    find,
    async require(id) {
      const note = await find(id);
      if (note === null) {
        throw new NoteNotFoundError(id);
      }
      return note;
    },
    async save(note) {
      const notes = await readNotes();
      const index = notes.findIndex((candidate) => candidate.id === note.id);
      if (index === -1) {
        throw new NoteNotFoundError(note.id);
      }
      notes[index] = note;
      await store.write({ notes });
    },
    async remove(id) {
      const notes = await readNotes();
      const index = notes.findIndex((candidate) => candidate.id === id);
      const note = index === -1 ? undefined : notes[index];
      if (note === undefined) {
        throw new NoteNotFoundError(id);
      }
      notes.splice(index, 1);
      await store.write({ notes });
      return note;
    },
  };
}
