import Database from 'better-sqlite3';
import path from 'node:path';
import { ensurePrivateDirectorySync, privatizeFileSync } from '@sothspell/core';
import {
  type AnchorVerification,
  type BeatEdit,
  type BeatRegeneration,
  type ReviewComment,
  type ReviewDecision,
  type ReviewListFilter,
  type ReviewSession,
  type ReviewState,
} from './schemas.js';

/**
 * The review store. Every mutation appends to the audit trail; the session row
 * carries only the state machine's state and timestamps. Migrations are
 * `CREATE TABLE IF NOT EXISTS` statements so opening an existing database — the
 * same file the run store uses — is idempotent.
 */

export interface ReviewStore {
  createSession(session: ReviewSession): void;
  getSession(id: string): ReviewSession | null;
  listSessions(filter?: ReviewListFilter): ReviewSession[];
  findByRevision(tourId: string, tourRevision: string): ReviewSession | null;
  updateState(id: string, state: ReviewState, updatedAt: string): void;
  appendComment(reviewId: string, comment: ReviewComment, updatedAt: string): void;
  appendEdit(reviewId: string, edit: BeatEdit, updatedAt: string): void;
  appendRegeneration(
    reviewId: string,
    regeneration: BeatRegeneration,
    updatedAt: string,
  ): void;
  markRegenerationReverted(
    reviewId: string,
    regenerationId: string,
    revertedAt: string,
    updatedAt: string,
  ): void;
  appendDecision(reviewId: string, decision: ReviewDecision, updatedAt: string): void;
  close(): void;
}

interface SessionRow {
  id: string;
  tour_id: string;
  tour_revision: string;
  state: string;
  reviewer: string;
  created_at: string;
  updated_at: string;
}

interface CommentRow {
  id: string;
  beat_id: string | null;
  author: string;
  body: string;
  created_at: string;
}

interface EditRow {
  id: string;
  beat_id: string;
  title: string;
  narration: string;
  suggested_questions: string;
  diagram_id: string | null;
  node_ids: string;
  edge_ids: string;
  source: string;
  reviewer: string;
  created_at: string;
}

interface RegenerationRow {
  id: string;
  beat_id: string;
  previous: string;
  generated: string;
  model_id: string;
  created_at: string;
  reverted_at: string | null;
  edit_id: string;
}

interface DecisionRow {
  id: string;
  kind: string;
  reviewer: string;
  reason: string | null;
  anchor_verification: string | null;
  quality_override: number;
  decided_at: string;
}

function readComment(row: CommentRow): ReviewComment {
  return {
    id: row.id,
    beatId: row.beat_id,
    author: row.author,
    body: row.body,
    createdAt: row.created_at,
  };
}

function readEdit(row: EditRow): BeatEdit {
  return {
    id: row.id,
    beatId: row.beat_id,
    title: row.title,
    narration: row.narration,
    suggestedQuestions: JSON.parse(row.suggested_questions) as string[],
    diagramFocus: {
      diagramId: row.diagram_id,
      nodeIds: JSON.parse(row.node_ids) as string[],
      edgeIds: JSON.parse(row.edge_ids) as string[],
    },
    source: row.source as BeatEdit['source'],
    reviewer: row.reviewer,
    createdAt: row.created_at,
  };
}

function readRegeneration(row: RegenerationRow): BeatRegeneration {
  return {
    id: row.id,
    beatId: row.beat_id,
    previous: JSON.parse(row.previous) as BeatRegeneration['previous'],
    generated: JSON.parse(row.generated) as BeatRegeneration['generated'],
    modelId: row.model_id,
    createdAt: row.created_at,
    revertedAt: row.reverted_at,
    editId: row.edit_id,
  };
}

function readDecision(row: DecisionRow): ReviewDecision {
  return {
    id: row.id,
    kind: row.kind as ReviewDecision['kind'],
    reviewer: row.reviewer,
    reason: row.reason,
    anchorVerification: row.anchor_verification
      ? (JSON.parse(row.anchor_verification) as AnchorVerification)
      : null,
    qualityOverride: row.quality_override === 1,
    decidedAt: row.decided_at,
  };
}

export function createReviewStore(databasePath: string): ReviewStore {
  if (databasePath !== ':memory:') {
    ensurePrivateDirectorySync(path.dirname(databasePath));
  }
  const database = new Database(databasePath);
  if (databasePath !== ':memory:') {
    privatizeFileSync(databasePath);
  }
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS review_sessions (
      id TEXT PRIMARY KEY,
      tour_id TEXT NOT NULL,
      tour_revision TEXT NOT NULL,
      state TEXT NOT NULL,
      reviewer TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS review_sessions_tour
      ON review_sessions (tour_id, tour_revision);

    CREATE TABLE IF NOT EXISTS review_comments (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
      beat_id TEXT,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS review_comments_review
      ON review_comments (review_id, created_at);

    CREATE TABLE IF NOT EXISTS review_edits (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
      beat_id TEXT NOT NULL,
      title TEXT NOT NULL,
      narration TEXT NOT NULL,
      suggested_questions TEXT NOT NULL,
      diagram_id TEXT,
      node_ids TEXT NOT NULL,
      edge_ids TEXT NOT NULL,
      source TEXT NOT NULL,
      reviewer TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS review_edits_review
      ON review_edits (review_id, created_at);

    CREATE TABLE IF NOT EXISTS review_regenerations (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
      beat_id TEXT NOT NULL,
      previous TEXT NOT NULL,
      generated TEXT NOT NULL,
      model_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reverted_at TEXT,
      edit_id TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS review_regenerations_review
      ON review_regenerations (review_id, created_at);

    CREATE TABLE IF NOT EXISTS review_decisions (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      reviewer TEXT NOT NULL,
      reason TEXT,
      anchor_verification TEXT,
      quality_override INTEGER NOT NULL,
      decided_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS review_decisions_review
      ON review_decisions (review_id, decided_at);
  `);

  function loadSession(id: string): ReviewSession | null {
    const row = database.prepare('SELECT * FROM review_sessions WHERE id = ?').get(id) as
      SessionRow | undefined;
    if (!row) {
      return null;
    }

    const comments = database
      .prepare(
        'SELECT * FROM review_comments WHERE review_id = ? ORDER BY created_at, id',
      )
      .all(id) as CommentRow[];
    const edits = database
      .prepare('SELECT * FROM review_edits WHERE review_id = ? ORDER BY created_at, id')
      .all(id) as EditRow[];
    const regenerations = database
      .prepare(
        'SELECT * FROM review_regenerations WHERE review_id = ? ORDER BY created_at, id',
      )
      .all(id) as RegenerationRow[];
    const decisions = database
      .prepare(
        'SELECT * FROM review_decisions WHERE review_id = ? ORDER BY decided_at, id',
      )
      .all(id) as DecisionRow[];

    return {
      id: row.id,
      tourId: row.tour_id,
      tourRevision: row.tour_revision,
      state: row.state as ReviewState,
      reviewer: row.reviewer,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      comments: comments.map(readComment),
      edits: edits.map(readEdit),
      regenerations: regenerations.map(readRegeneration),
      decisions: decisions.map(readDecision),
    };
  }

  function touch(reviewId: string, updatedAt: string): void {
    database
      .prepare('UPDATE review_sessions SET updated_at = ? WHERE id = ?')
      .run(updatedAt, reviewId);
  }

  return {
    createSession(session) {
      database
        .prepare(
          `INSERT INTO review_sessions
             (id, tour_id, tour_revision, state, reviewer, created_at, updated_at)
           VALUES (@id, @tourId, @tourRevision, @state, @reviewer, @createdAt, @updatedAt)`,
        )
        .run({
          id: session.id,
          tourId: session.tourId,
          tourRevision: session.tourRevision,
          state: session.state,
          reviewer: session.reviewer,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        });
    },

    getSession(id) {
      return loadSession(id);
    },

    listSessions(filter = {}) {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (filter.tourId !== undefined) {
        clauses.push('tour_id = ?');
        params.push(filter.tourId);
      }
      if (filter.state !== undefined) {
        clauses.push('state = ?');
        params.push(filter.state);
      }
      const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
      const rows = database
        .prepare(`SELECT id FROM review_sessions${where} ORDER BY updated_at DESC`)
        .all(...params) as Array<{ id: string }>;
      return rows
        .map((row) => loadSession(row.id))
        .filter((session): session is ReviewSession => session !== null);
    },

    findByRevision(tourId, tourRevision) {
      const row = database
        .prepare(
          `SELECT id FROM review_sessions
           WHERE tour_id = ? AND tour_revision = ?
           ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(tourId, tourRevision) as { id: string } | undefined;
      return row ? loadSession(row.id) : null;
    },

    updateState(id, state, updatedAt) {
      database
        .prepare('UPDATE review_sessions SET state = ?, updated_at = ? WHERE id = ?')
        .run(state, updatedAt, id);
    },

    appendComment(reviewId, comment, updatedAt) {
      database
        .prepare(
          `INSERT INTO review_comments (id, review_id, beat_id, author, body, created_at)
           VALUES (@id, @reviewId, @beatId, @author, @body, @createdAt)`,
        )
        .run({
          id: comment.id,
          reviewId,
          beatId: comment.beatId,
          author: comment.author,
          body: comment.body,
          createdAt: comment.createdAt,
        });
      touch(reviewId, updatedAt);
    },

    appendEdit(reviewId, edit, updatedAt) {
      database
        .prepare(
          `INSERT INTO review_edits
             (id, review_id, beat_id, title, narration, suggested_questions,
              diagram_id, node_ids, edge_ids, source, reviewer, created_at)
           VALUES (@id, @reviewId, @beatId, @title, @narration, @suggestedQuestions,
                   @diagramId, @nodeIds, @edgeIds, @source, @reviewer, @createdAt)`,
        )
        .run({
          id: edit.id,
          reviewId,
          beatId: edit.beatId,
          title: edit.title,
          narration: edit.narration,
          suggestedQuestions: JSON.stringify(edit.suggestedQuestions),
          diagramId: edit.diagramFocus.diagramId,
          nodeIds: JSON.stringify(edit.diagramFocus.nodeIds),
          edgeIds: JSON.stringify(edit.diagramFocus.edgeIds),
          source: edit.source,
          reviewer: edit.reviewer,
          createdAt: edit.createdAt,
        });
      touch(reviewId, updatedAt);
    },

    appendRegeneration(reviewId, regeneration, updatedAt) {
      database
        .prepare(
          `INSERT INTO review_regenerations
             (id, review_id, beat_id, previous, generated, model_id, created_at,
              reverted_at, edit_id)
           VALUES (@id, @reviewId, @beatId, @previous, @generated, @modelId,
                   @createdAt, @revertedAt, @editId)`,
        )
        .run({
          id: regeneration.id,
          reviewId,
          beatId: regeneration.beatId,
          previous: JSON.stringify(regeneration.previous),
          generated: JSON.stringify(regeneration.generated),
          modelId: regeneration.modelId,
          createdAt: regeneration.createdAt,
          revertedAt: regeneration.revertedAt,
          editId: regeneration.editId,
        });
      touch(reviewId, updatedAt);
    },

    markRegenerationReverted(reviewId, regenerationId, revertedAt, updatedAt) {
      database
        .prepare(
          'UPDATE review_regenerations SET reverted_at = ? WHERE id = ? AND review_id = ?',
        )
        .run(revertedAt, regenerationId, reviewId);
      touch(reviewId, updatedAt);
    },

    appendDecision(reviewId, decision, updatedAt) {
      database
        .prepare(
          `INSERT INTO review_decisions
             (id, review_id, kind, reviewer, reason, anchor_verification,
              quality_override, decided_at)
           VALUES (@id, @reviewId, @kind, @reviewer, @reason, @anchorVerification,
                   @qualityOverride, @decidedAt)`,
        )
        .run({
          id: decision.id,
          reviewId,
          kind: decision.kind,
          reviewer: decision.reviewer,
          reason: decision.reason,
          anchorVerification: decision.anchorVerification
            ? JSON.stringify(decision.anchorVerification)
            : null,
          qualityOverride: decision.qualityOverride ? 1 : 0,
          decidedAt: decision.decidedAt,
        });
      touch(reviewId, updatedAt);
    },

    close() {
      database.close();
    },
  };
}
