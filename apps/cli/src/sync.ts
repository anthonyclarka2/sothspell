import {
  mergeRunCollections,
  type RunMode,
  type RunTombstone,
  type SyncRun,
} from '@sothspell/accounts';
import type { CliIO } from './cli.js';
import {
  defaultServerUrl,
  parseAccountArgs,
  readCredentials,
  requestAccountJson,
  resolveClientId,
  sothspellHome,
  type AccountCommandOptions,
} from './account.js';

/**
 * `sothspell sync`. This machine's local progress is the server's anonymous
 * run scope for the CLI client id; push is the explicit claim, and pull merges
 * the account state into that local scope with the documented rules.
 */

const SYNC_USAGE = `Usage:
  sothspell sync status [--client <id>] [--server <url>]
  sothspell sync push [--client <id>] [--server <url>]
  sothspell sync pull [--client <id>] [--server <url>]

Commands:
  status   Show the account state and local/account run counts.
  push     Attach this machine's anonymous runs to the account.
  pull     Merge account runs into this machine's local runs.

Options:
  --server <url>    Sothspell server base URL (default http://127.0.0.1:4319).
  --client <id>     Local anonymous client id (default SOTHSPELL_CLIENT_ID).
  --help            Show this help.
`;

interface AnonymousRun {
  tourId: string;
  beatId: string;
  offsetMs: number;
  completedBeatIds: string[];
  mode: RunMode;
  speed: number;
  updatedAt: number;
}

function serverFor(
  options: AccountCommandOptions,
  flags: Map<string, string>,
  storedServerUrl?: string,
): string {
  return (
    flags.get('--server') ??
    options.serverUrl ??
    storedServerUrl ??
    defaultServerUrl()
  ).replace(/\/$/u, '');
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function syncStatus(
  options: AccountCommandOptions,
  flags: Map<string, string>,
  io: CliIO,
): Promise<number> {
  const home = sothspellHome(options);
  const credentials = await readCredentials(home);
  const serverUrl = serverFor(options, flags, credentials?.serverUrl);
  const clientId = await resolveClientId(home, flags.get('--client') ?? options.clientId);

  const local = await requestAccountJson(
    options,
    `${serverUrl}/api/runs?clientId=${encodeURIComponent(clientId)}`,
  );
  const localRuns = (local.body.runs as AnonymousRun[] | undefined) ?? [];

  io.stdout(
    `Account: ${credentials ? `signed in as ${credentials.login}` : 'not signed in'}`,
  );
  io.stdout(`Server: ${serverUrl}`);
  io.stdout(`Local runs: ${localRuns.length} (client ${clientId})`);

  if (!credentials) {
    return 0;
  }
  const pulled = await requestAccountJson(options, `${serverUrl}/api/sync/pull`, {
    method: 'POST',
    headers: bearer(credentials.token),
  });
  if (pulled.status !== 200) {
    io.stderr(
      `Account runs: unavailable (${typeof pulled.body.error === 'string' ? pulled.body.error : pulled.status})`,
    );
    return 1;
  }
  const accountRuns = (pulled.body.runs as SyncRun[] | undefined) ?? [];
  io.stdout(`Account runs: ${accountRuns.length}`);
  return 0;
}

async function syncPush(
  options: AccountCommandOptions,
  flags: Map<string, string>,
  io: CliIO,
): Promise<number> {
  const home = sothspellHome(options);
  const credentials = await readCredentials(home);
  if (!credentials) {
    io.stderr('Not signed in. Run `sothspell account signin` first.');
    return 1;
  }
  const serverUrl = serverFor(options, flags, credentials.serverUrl);
  const clientId = await resolveClientId(home, flags.get('--client') ?? options.clientId);

  const result = await requestAccountJson(options, `${serverUrl}/api/sync/claim`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...bearer(credentials.token),
    },
    body: JSON.stringify({ clientId }),
  });
  if (result.status !== 200) {
    io.stderr(
      `Push failed: ${typeof result.body.error === 'string' ? result.body.error : `status ${result.status}`}`,
    );
    return 1;
  }
  const claimed = typeof result.body.claimed === 'number' ? result.body.claimed : 0;
  io.stdout(`Attached ${claimed} local run(s) to ${credentials.login}.`);
  return 0;
}

async function syncPull(
  options: AccountCommandOptions,
  flags: Map<string, string>,
  io: CliIO,
): Promise<number> {
  const home = sothspellHome(options);
  const credentials = await readCredentials(home);
  if (!credentials) {
    io.stderr('Not signed in. Run `sothspell account signin` first.');
    return 1;
  }
  const serverUrl = serverFor(options, flags, credentials.serverUrl);
  const clientId = await resolveClientId(home, flags.get('--client') ?? options.clientId);

  const pulled = await requestAccountJson(options, `${serverUrl}/api/sync/pull`, {
    method: 'POST',
    headers: bearer(credentials.token),
  });
  if (pulled.status !== 200) {
    io.stderr(
      `Pull failed: ${typeof pulled.body.error === 'string' ? pulled.body.error : `status ${pulled.status}`}`,
    );
    return 1;
  }
  const accountRuns = (pulled.body.runs as SyncRun[] | undefined) ?? [];
  const tombstones = (pulled.body.tombstones as RunTombstone[] | undefined) ?? [];

  const localResponse = await requestAccountJson(
    options,
    `${serverUrl}/api/runs?clientId=${encodeURIComponent(clientId)}`,
  );
  const localRuns = (localResponse.body.runs as AnonymousRun[] | undefined) ?? [];
  const merged = mergeRunCollections(localRuns, accountRuns, tombstones);

  for (const run of merged) {
    await requestAccountJson(
      options,
      `${serverUrl}/api/runs/${encodeURIComponent(run.tourId)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          beatId: run.beatId,
          offsetMs: run.offsetMs,
          completedBeatIds: run.completedBeatIds,
          mode: run.mode,
          speed: run.speed,
          updatedAt: run.updatedAt,
        }),
      },
    );
  }

  let removed = 0;
  for (const tombstone of tombstones) {
    const local = localRuns.find((run) => run.tourId === tombstone.tourId);
    if (local && local.updatedAt <= tombstone.deletedAt) {
      await requestAccountJson(
        options,
        `${serverUrl}/api/runs/${encodeURIComponent(tombstone.tourId)}?clientId=${encodeURIComponent(clientId)}`,
        { method: 'DELETE' },
      );
      removed += 1;
    }
  }

  io.stdout(
    `Pulled ${accountRuns.length} account run(s); ${merged.length} run(s) available locally${removed > 0 ? `; ${removed} removed` : ''}.`,
  );
  return 0;
}

export async function runSyncCommand(
  argv: string[],
  io: CliIO,
  options: AccountCommandOptions = {},
): Promise<number> {
  const [subcommand, ...rest] = argv;
  if (!subcommand || subcommand === '--help') {
    io.stdout(SYNC_USAGE.trimEnd());
    return 0;
  }

  let flags: Map<string, string>;
  try {
    ({ flags } = parseAccountArgs(rest));
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 2;
  }

  try {
    switch (subcommand) {
      case 'status':
        return await syncStatus(options, flags, io);
      case 'push':
        return await syncPush(options, flags, io);
      case 'pull':
        return await syncPull(options, flags, io);
      default:
        io.stderr(`unknown sync command: ${subcommand}\n\n${SYNC_USAGE}`);
        return 2;
    }
  } catch (error) {
    io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
