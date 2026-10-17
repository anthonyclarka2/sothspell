/**
 * The tiny-notes domain model. Types live in their own module so the storage,
 * notes, HTTP, and CLI layers can agree on the shape of a note without
 * depending on each other.
 */

/** A note exactly as it is stored and returned by the service. */
export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  /** ISO 8601 timestamp; notes are listed newest first. */
  createdAt: string;
  /** ISO 8601 timestamp once archived, otherwise null. */
  archivedAt: string | null;
}

/** The user-supplied fields for a new note; id and timestamps are assigned. */
export interface NoteDraft {
  title: string;
  body?: string;
  tags?: string[];
}

/** Filters shared by listing and searching. */
export interface NoteQuery {
  tag?: string;
  text?: string;
  includeArchived?: boolean;
}

/** Aggregate counts behind the summary command. */
export interface NoteSummary {
  total: number;
  active: number;
  archived: number;
  tags: Array<{ tag: string; count: number }>;
}

/** Raised when a note id does not exist. */
export class NoteNotFoundError extends Error {
  readonly noteId: string;

  constructor(noteId: string) {
    super(`note not found: ${noteId}`);
    this.name = 'NoteNotFoundError';
    this.noteId = noteId;
  }
}

/** Raised when a draft cannot become a note. */
export class NoteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoteValidationError';
  }
}
