import os from 'node:os';
import path from 'node:path';
import {
  createFileTourSource,
  createReviewService,
  createReviewStore,
  ReviewError,
  type ReviewSession,
  type ReviewService,
  type ReviewState,
} from '@sothspell/review';
import type { CliIO } from './cli.js';

/**
 * `sothspell review` — the terminal surface over the same review service the
 * web app uses. `list` and `show` read the local audit trail; `approve` runs
 * the anchor gate; `reject` requires a reason.
 */

export interface ReviewCommandOptions {
  /** Injected service; tests use a store over a temp database. */
  service?: ReviewService;
}

const USAGE = `Usage:
  sothspell review list [--tour <tourId>] [--state <state>] [--json]
  sothspell review show <reviewId> [--json]
  sothspell review approve <reviewId> [--reviewer <name>]
  sothspell review reject <reviewId> --reason <text> [--reviewer <name>]

Commands:
  review list           List review sessions, newest first.
  review show           Print one review session and its audit trail.
  review approve        Approve a review after re-verifying every anchor.
  review reject         Reject a review; a reason is required.

Options:
  --tour <tourId>       Only list reviews for one tour.
  --state <state>       Only list reviews in draft, in_review, approved, or rejected.
  --reason <text>       The rejection reason (required for reject).
  --reviewer <name>     Record a named reviewer instead of "local".
  --json                Print the raw record.
  --help                Show this help.
`;

const STATES: readonly ReviewState[] = ['draft', 'in_review', 'approved', 'rejected'];

function sothspellHome(): string {
  return process.env.SOTHSPELL_HOME ?? path.join(os.homedir(), '.sothspell');
}

function defaultService(): ReviewService {
  return createReviewService({
    store: createReviewStore(path.join(sothspellHome(), 'sothspell.db')),
    tours: createFileTourSource({
      homeDirectory: sothspellHome(),
      goldenTourPath: new URL('../../../examples/bunbun-tour/tour.json', import.meta.url)
        .pathname,
      goldenTourIds: ['tour_bunbun_golden', 'bunbun-golden'],
    }),
    sourceRoot: process.env.SOTHSPELL_PROJECT_ROOT ?? null,
    // The CLI does not regenerate beats; that is the review UI's job.
    resolveModel: async () => null,
  });
}

interface ReviewArgs {
  command: 'list' | 'show' | 'approve' | 'reject';
  id: string | null;
  tourId: string | null;
  state: ReviewState | null;
  reason: string | null;
  reviewer: string | null;
  json: boolean;
}

function parseReviewArgs(argv: string[]): ReviewArgs {
  const command = argv[0];
  if (
    command !== 'list' &&
    command !== 'show' &&
    command !== 'approve' &&
    command !== 'reject'
  ) {
    throw new Error(`review needs a command\n\n${USAGE}`);
  }

  let id: string | null = null;
  let tourId: string | null = null;
  let state: ReviewState | null = null;
  let reason: string | null = null;
  let reviewer: string | null = null;
  let json = false;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    switch (arg) {
      case '--tour': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error(`--tour needs a tour id\n\n${USAGE}`);
        }
        tourId = value;
        index += 1;
        break;
      }
      case '--state': {
        const value = argv[index + 1] as ReviewState | undefined;
        if (!value || !STATES.includes(value)) {
          throw new Error(`--state must be one of ${STATES.join(', ')}\n\n${USAGE}`);
        }
        state = value;
        index += 1;
        break;
      }
      case '--reason': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error(`--reason needs a reason\n\n${USAGE}`);
        }
        reason = value;
        index += 1;
        break;
      }
      case '--reviewer': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error(`--reviewer needs a name\n\n${USAGE}`);
        }
        reviewer = value;
        index += 1;
        break;
      }
      case '--json':
        json = true;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`unknown option: ${arg}\n\n${USAGE}`);
        }
        if (id !== null) {
          throw new Error(`review ${command} takes one review id\n\n${USAGE}`);
        }
        id = arg;
        break;
    }
  }

  if (command !== 'list' && id === null) {
    throw new Error(`review ${command} needs a review id\n\n${USAGE}`);
  }

  return { command, id, tourId, state, reason, reviewer, json };
}

function sessionLine(session: ReviewSession): string {
  const comments =
    session.comments.length === 1 ? '1 comment' : `${session.comments.length} comments`;
  return [
    session.id,
    session.state,
    session.tourId,
    session.reviewer,
    comments,
    session.updatedAt,
  ].join('  ');
}

function showSession(session: ReviewSession, io: CliIO): void {
  io.stdout(`Review: ${session.id}`);
  io.stdout(`Tour: ${session.tourId}`);
  io.stdout(`Tour revision: ${session.tourRevision}`);
  io.stdout(`State: ${session.state}`);
  io.stdout(`Reviewer: ${session.reviewer}`);
  io.stdout(`Started: ${session.createdAt}`);
  io.stdout(`Updated: ${session.updatedAt}`);

  io.stdout(`Comments: ${session.comments.length}`);
  for (const comment of session.comments) {
    io.stdout(
      `  ${comment.beatId ?? 'tour'} · ${comment.author} · ${comment.createdAt}: ${comment.body}`,
    );
  }

  io.stdout(`Edits: ${session.edits.length}`);
  for (const edit of session.edits) {
    io.stdout(`  ${edit.beatId} · ${edit.source} · ${edit.reviewer} · ${edit.title}`);
  }

  io.stdout(`Regenerations: ${session.regenerations.length}`);
  for (const regeneration of session.regenerations) {
    io.stdout(
      `  ${regeneration.beatId} · ${regeneration.modelId} · ${
        regeneration.revertedAt ? `reverted ${regeneration.revertedAt}` : 'applied'
      }`,
    );
  }

  io.stdout(`Decisions: ${session.decisions.length}`);
  for (const decision of session.decisions) {
    io.stdout(
      `  ${decision.kind} · ${decision.reviewer} · ${decision.decidedAt}${
        decision.reason ? ` · ${decision.reason}` : ''
      }`,
    );
  }
}

function reportError(io: CliIO, error: unknown): number {
  if (error instanceof ReviewError) {
    io.stderr(`Error: ${error.message}`);
    for (const detail of error.details) {
      io.stderr(`  ${detail}`);
    }
    return 1;
  }
  io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}`);
  return 1;
}

export async function runReview(
  argv: string[],
  io: CliIO,
  options: ReviewCommandOptions = {},
): Promise<number> {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === 'help') {
    io.stdout(USAGE.trimEnd());
    return 0;
  }

  let args: ReviewArgs;
  try {
    args = parseReviewArgs(argv);
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 2;
  }

  const service = options.service ?? defaultService();

  try {
    if (args.command === 'list') {
      const sessions = await service.list({
        ...(args.tourId === null ? {} : { tourId: args.tourId }),
        ...(args.state === null ? {} : { state: args.state }),
      });
      if (args.json) {
        io.stdout(JSON.stringify(sessions, null, 2));
        return 0;
      }
      if (sessions.length === 0) {
        io.stdout('No review sessions.');
        return 0;
      }
      for (const session of sessions) {
        io.stdout(sessionLine(session));
      }
      return 0;
    }

    const id = args.id as string;

    if (args.command === 'show') {
      const session = await service.get(id);
      if (!session) {
        io.stderr(`Error: unknown review: ${id}`);
        return 1;
      }
      if (args.json) {
        io.stdout(JSON.stringify(session, null, 2));
      } else {
        showSession(session, io);
      }
      return 0;
    }

    if (args.command === 'approve') {
      const session = await service.decide(id, {
        decision: 'approve',
        ...(args.reviewer === null ? {} : { reviewer: args.reviewer }),
      });
      const decision = session.decisions.at(-1);
      const verified = decision?.anchorVerification?.checks.length ?? 0;
      io.stdout(`Approved ${session.id} — ${verified} anchors verified`);
      return 0;
    }

    if (args.reason === null || args.reason.trim().length === 0) {
      io.stderr(`a rejection requires --reason\n\n${USAGE}`);
      return 2;
    }
    const session = await service.decide(id, {
      decision: 'reject',
      reason: args.reason,
      ...(args.reviewer === null ? {} : { reviewer: args.reviewer }),
    });
    io.stdout(`Rejected ${session.id}`);
    return 0;
  } catch (error) {
    return reportError(io, error);
  }
}
