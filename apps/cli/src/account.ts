import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CliIO } from './cli.js';
import { runSyncCommand } from './sync.js';

/**
 * `sothspell account` and `sothspell sync`. The CLI signs in through the local
 * server's GitHub device flow and stores the session token under
 * SOTHSPELL_HOME (mode 0600); the token is never printed.
 */

export interface AccountCommandOptions {
  fetchImpl?: typeof fetch;
  home?: string;
  serverUrl?: string;
  sleep?: (milliseconds: number) => Promise<void>;
  /** Test seam: caps the device-flow poll loop. */
  maxPollAttempts?: number;
  /** Overrides the poll interval in milliseconds (tests only). */
  pollIntervalMs?: number;
  /** Overrides the local anonymous client id. */
  clientId?: string;
}

export interface StoredCredentials {
  serverUrl: string;
  token: string;
  login: string;
  signedInAt: number;
}

const ACCOUNT_USAGE = `Usage:
  sothspell account signin [--server <url>]
  sothspell account signout
  sothspell account status
  sothspell sync status [--client <id>]
  sothspell sync push [--client <id>]
  sothspell sync pull [--client <id>]

Commands:
  account signin    Sign in with GitHub through the device flow.
  account signout   Revoke the stored session and remove local credentials.
  account status    Show the signed-in account for this server.
  sync status       Show local and account run counts.
  sync push         Attach this machine's anonymous runs to the account.
  sync pull         Merge account runs into this machine's local runs.

Options:
  --server <url>    Sothspell server base URL (default http://127.0.0.1:4319).
  --client <id>     Local anonymous client id (default SOTHSPELL_CLIENT_ID).
  --help            Show this help.
`;

export function defaultServerUrl(): string {
  return process.env.SOTHSPELL_URL ?? 'http://127.0.0.1:4319';
}

export function sothspellHome(options: AccountCommandOptions = {}): string {
  return (
    options.home ?? process.env.SOTHSPELL_HOME ?? path.join(os.homedir(), '.sothspell')
  );
}

export function accountsFilePath(home: string): string {
  return path.join(home, 'accounts.json');
}

export function clientIdFilePath(home: string): string {
  return path.join(home, 'client-id');
}

export async function readCredentials(
  home: string,
): Promise<StoredCredentials | null> {
  try {
    const raw = await readFile(accountsFilePath(home), 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
    if (
      typeof parsed.serverUrl !== 'string' ||
      typeof parsed.token !== 'string' ||
      typeof parsed.login !== 'string'
    ) {
      return null;
    }
    return {
      serverUrl: parsed.serverUrl,
      token: parsed.token,
      login: parsed.login,
      signedInAt: typeof parsed.signedInAt === 'number' ? parsed.signedInAt : 0,
    };
  } catch {
    return null;
  }
}

export async function writeCredentials(
  home: string,
  credentials: StoredCredentials,
): Promise<void> {
  await mkdir(home, { recursive: true });
  await writeFile(
    accountsFilePath(home),
    `${JSON.stringify(credentials, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
}

export async function clearCredentials(home: string): Promise<void> {
  await rm(accountsFilePath(home), { force: true });
}

/** A stable local client id, mirroring the browser's localStorage id. */
export async function resolveClientId(
  home: string,
  override?: string,
): Promise<string> {
  if (override) {
    return override;
  }
  if (process.env.SOTHSPELL_CLIENT_ID) {
    return process.env.SOTHSPELL_CLIENT_ID;
  }
  try {
    const existing = (await readFile(clientIdFilePath(home), 'utf8')).trim();
    if (existing.length >= 8) {
      return existing;
    }
  } catch {
    // No client id yet; create one below.
  }
  const created = randomUUID();
  await mkdir(home, { recursive: true });
  await writeFile(clientIdFilePath(home), `${created}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return created;
}

interface RequestResult {
  status: number;
  body: Record<string, unknown>;
}

export async function requestAccountJson(
  options: AccountCommandOptions,
  url: string,
  init: RequestInit = {},
): Promise<RequestResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url, init);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body };
}

const requestJson = requestAccountJson;

function errorMessage(body: Record<string, unknown>, fallback: string): string {
  return typeof body.error === 'string' ? body.error : fallback;
}

export function parseAccountArgs(
  argv: string[],
): { flags: Map<string, string>; positional: string[] } {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--server' || arg === '--client') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} needs a value\n\n${ACCOUNT_USAGE}`);
      }
      flags.set(arg, value);
      index += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown option: ${arg}\n\n${ACCOUNT_USAGE}`);
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

async function runSignIn(
  options: AccountCommandOptions,
  flags: Map<string, string>,
  io: CliIO,
): Promise<number> {
  const home = sothspellHome(options);
  const serverUrl = (flags.get('--server') ?? options.serverUrl ?? defaultServerUrl()).replace(
    /\/$/u,
    '',
  );
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  const started = await requestJson(options, `${serverUrl}/api/auth/github/device`, {
    method: 'POST',
  }).catch(() => null);
  if (!started) {
    io.stderr(`Could not reach the Sothspell server at ${serverUrl}.`);
    return 1;
  }
  if (started.status !== 200) {
    io.stderr(
      `Device sign-in is unavailable: ${errorMessage(started.body, `status ${started.status}`)}`,
    );
    return 1;
  }

  const pendingId = String(started.body.pendingId ?? '');
  const userCode = String(started.body.userCode ?? '');
  const verificationUri = String(started.body.verificationUri ?? '');
  const expiresInSeconds = Number(started.body.expiresInSeconds ?? 900);
  let intervalMs =
    options.pollIntervalMs ?? Number(started.body.intervalSeconds ?? 5) * 1000;
  const maxAttempts =
    options.maxPollAttempts ??
    Math.ceil(expiresInSeconds / Math.max(1, intervalMs / 1000)) + 5;

  io.stdout(`Open ${verificationUri} and enter the code ${userCode}`);
  io.stdout('Waiting for GitHub approval…');

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await sleep(intervalMs);
    const poll = await requestJson(options, `${serverUrl}/api/auth/github/device/poll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pendingId }),
    }).catch(() => null);
    if (!poll) {
      io.stderr(`Lost contact with ${serverUrl} while waiting for approval.`);
      return 1;
    }
    const status = String(poll.body.status ?? '');
    if (status === 'complete') {
      const token = String(poll.body.token ?? '');
      const user = poll.body.user as { login?: string } | undefined;
      const login = user?.login ?? 'unknown';
      await writeCredentials(home, {
        serverUrl,
        token,
        login,
        signedInAt: Date.now(),
      });
      io.stdout(`Signed in as ${login} (${serverUrl}).`);
      io.stdout(`Credentials stored at ${accountsFilePath(home)}.`);
      return 0;
    }
    if (status === 'expired') {
      io.stderr('The device code expired; run `sothspell account signin` again.');
      return 1;
    }
    if (status === 'denied') {
      io.stderr('Sign-in was denied on GitHub.');
      return 1;
    }
    if (typeof poll.body.intervalSeconds === 'number') {
      intervalMs = options.pollIntervalMs ?? poll.body.intervalSeconds * 1000;
    }
  }

  io.stderr('Timed out waiting for GitHub approval.');
  return 1;
}

async function runSignOut(options: AccountCommandOptions, io: CliIO): Promise<number> {
  const home = sothspellHome(options);
  const credentials = await readCredentials(home);
  if (!credentials) {
    io.stdout('Not signed in.');
    return 0;
  }
  await requestJson(options, `${credentials.serverUrl}/api/auth/signout`, {
    method: 'POST',
    headers: { authorization: `Bearer ${credentials.token}` },
  }).catch(() => undefined);
  await clearCredentials(home);
  io.stdout('Signed out; local credentials removed.');
  return 0;
}

async function runStatus(
  options: AccountCommandOptions,
  flags: Map<string, string>,
  io: CliIO,
): Promise<number> {
  const home = sothspellHome(options);
  const credentials = await readCredentials(home);
  if (!credentials) {
    io.stdout('Not signed in. Run `sothspell account signin`.');
    return 0;
  }
  const serverUrl = (
    flags.get('--server') ??
    options.serverUrl ??
    credentials.serverUrl
  ).replace(/\/$/u, '');
  const session = await requestJson(options, `${serverUrl}/api/auth/session`, {
    headers: { authorization: `Bearer ${credentials.token}` },
  }).catch(() => null);
  if (!session) {
    io.stderr(`Could not reach the Sothspell server at ${serverUrl}.`);
    return 1;
  }
  if (session.status === 200 && session.body.signedIn === true) {
    const user = session.body.user as { login?: string } | undefined;
    io.stdout(`Signed in as ${user?.login ?? credentials.login} · ${serverUrl}`);
    return 0;
  }
  io.stdout(
    `Stored credentials for ${serverUrl} are no longer valid. Run \`sothspell account signin\` again.`,
  );
  return 0;
}

/**
 * One dispatch branch in cli.ts calls this for both `account` and `sync`;
 * keeping the two command families here avoids touching the shared CLI shell
 * more than once.
 */
export async function runAccountCommand(
  argv: string[],
  io: CliIO,
  options: AccountCommandOptions = {},
): Promise<number> {
  const [group, subcommand, ...rest] = argv;
  if (group === 'sync') {
    return runSyncCommand([subcommand ?? '', ...rest], io, options);
  }
  if (group !== 'account') {
    io.stderr(`unknown command: ${group ?? ''}\n\n${ACCOUNT_USAGE}`);
    return 2;
  }
  if (!subcommand || subcommand === '--help') {
    io.stdout(ACCOUNT_USAGE.trimEnd());
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
      case 'signin':
        return await runSignIn(options, flags, io);
      case 'signout':
        return await runSignOut(options, io);
      case 'status':
        return await runStatus(options, flags, io);
      default:
        io.stderr(`unknown account command: ${subcommand}\n\n${ACCOUNT_USAGE}`);
        return 2;
    }
  } catch (error) {
    io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
