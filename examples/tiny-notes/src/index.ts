/**
 * The public entry for tiny-notes. One function wires storage, the repository,
 * and the service together so the CLI, the HTTP adapter, and tests all open a
 * store the same way.
 */
import { createJsonStore } from './storage/file-store.ts';
import {
  createNoteRepository,
  type NotesDocument,
  type RepositoryOptions,
} from './notes/repository.ts';
import { createNoteService, type NoteService } from './notes/service.ts';

export { NoteNotFoundError, NoteValidationError } from './types.ts';
export type { Note, NoteDraft, NoteQuery, NoteSummary } from './types.ts';
export type { NoteService } from './notes/service.ts';

export interface OpenNotesOptions extends RepositoryOptions {
  /** Absolute path of the JSON file that backs the store. */
  filePath: string;
}

export function openNotes(options: OpenNotesOptions): NoteService {
  const store = createJsonStore<NotesDocument>(options.filePath, () => ({ notes: [] }));
  return createNoteService(createNoteRepository(store, options), { now: options.now });
}
