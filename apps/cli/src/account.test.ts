import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '@sothspell/api/app';
import { runAccountCommand } from './account.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (line: string) => stdout.push(line),
      stderr: (line: string) => stderr.push(line),
    },
  };
}

function fakeGithub() {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    if (url.endsWith('/login/oauth/access_token')) {
      if (typeof body.grant_type === 'string') {
        return Response.json({ access_token: 'gho_device_token' });
      }
      return Response.json({ access_token: 'gho_code_token' });
    }
    if (url.endsWith('/user')) {
      return Response.json({ id: 7, login: 'octocat', name: 'The Octocat' });
    }
    if (url.endsWith('/login/device/code')) {
      return Response.json({
        device_code: 'device-1',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.test/login/device',
        expires_in: 900,
        interval: 5,
      });
    }
    return new Response('unexpected provider call', { status: 500 });
  }) as typeof fetch;
  return { fetchImpl };
}

async function makeHarness() {
  const home = await mkdtemp(path.join(tmpdir(), 'sothspell-cli-account-'));
  roots.push(home);
  const app = createApp({
    databasePath: ':memory:',
    githubClientId: 'client-1',
    githubClientSecret: 'secret-1',
    sessionSecret: 'test-session-secret',
    publicUrl: 'http://127.0.0.1:4319',
    oauthFetchImpl: fakeGithub().fetchImpl,
    now: () => 5_000,
  });
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) =>
    app.request(String(input), init)) as typeof fetch;
  const options = {
    fetchImpl,
    home,
    serverUrl: 'http://127.0.0.1:4319',
    clientId: 'client-abcdefgh',
    sleep: async () => undefined,
    pollIntervalMs: 1,
    maxPollAttempts: 1,
  };
  return { app, home, fetchImpl, options };
}

async function signIn(
  harness: Awaited<ReturnType<typeof makeHarness>>,
  io: ReturnType<typeof capture>,
) {
  const code = await runAccountCommand(['account', 'signin'], io.io, harness.options);
  expect(code).toBe(0);
  return JSON.parse(await readFile(path.join(harness.home, 'accounts.json'), 'utf8')) as {
    token: string;
    login: string;
    serverUrl: string;
  };
}

async function seedAnonymousRun(
  harness: Awaited<ReturnType<typeof makeHarness>>,
  beatId: string,
) {
  const response = await harness.app.request('/api/runs/tour_bunbun_golden', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: 'client-abcdefgh',
      beatId,
      offsetMs: 100,
      completedBeatIds: [beatId],
      mode: 'read',
      speed: 1,
    }),
  });
  expect(response.status).toBe(200);
}

describe('sothspell account', () => {
  it('signs in through the device flow and stores 0600 credentials', async () => {
    const harness = await makeHarness();
    const output = capture();

    const code = await runAccountCommand(
      ['account', 'signin'],
      output.io,
      harness.options,
    );

    expect(code).toBe(0);
    const stdout = output.stdout.join('\n');
    expect(stdout).toContain('ABCD-EFGH');
    expect(stdout).toContain('https://github.test/login/device');
    expect(stdout).toContain('Signed in as octocat');

    const credentialsPath = path.join(harness.home, 'accounts.json');
    const credentials = JSON.parse(await readFile(credentialsPath, 'utf8')) as {
      token: string;
      login: string;
    };
    expect(credentials.login).toBe('octocat');
    expect(credentials.token.length).toBeGreaterThan(10);
    expect(stdout).not.toContain(credentials.token);
    expect(((await stat(credentialsPath)).mode & 0o777).toString(8)).toBe('600');
  });

  it('reports status, signs out, and clears credentials', async () => {
    const harness = await makeHarness();

    const empty = capture();
    expect(
      await runAccountCommand(['account', 'status'], empty.io, harness.options),
    ).toBe(0);
    expect(empty.stdout.join('\n')).toContain('Not signed in');

    const signin = capture();
    await signIn(harness, signin);

    const status = capture();
    expect(
      await runAccountCommand(['account', 'status'], status.io, harness.options),
    ).toBe(0);
    expect(status.stdout.join('\n')).toContain('Signed in as octocat');

    const signout = capture();
    expect(
      await runAccountCommand(['account', 'signout'], signout.io, harness.options),
    ).toBe(0);
    expect(signout.stdout.join('\n')).toContain('Signed out');

    const after = capture();
    await runAccountCommand(['account', 'status'], after.io, harness.options);
    expect(after.stdout.join('\n')).toContain('Not signed in');
  });

  it('prints usage for an unknown subcommand', async () => {
    const harness = await makeHarness();
    const output = capture();
    const code = await runAccountCommand(
      ['account', 'nonsense'],
      output.io,
      harness.options,
    );
    expect(code).toBe(2);
    expect(output.stderr.join('\n')).toContain('unknown account command');
  });
});

describe('sothspell sync', () => {
  it('reports local and account counts', async () => {
    const harness = await makeHarness();
    await seedAnonymousRun(harness, 'beat_purpose_01');
    const signin = capture();
    await signIn(harness, signin);

    const output = capture();
    const code = await runAccountCommand(['sync', 'status'], output.io, harness.options);

    expect(code).toBe(0);
    const stdout = output.stdout.join('\n');
    expect(stdout).toContain('Account: signed in as octocat');
    expect(stdout).toContain('Local runs: 1');
    expect(stdout).toContain('Account runs: 0');
  });

  it('pushes anonymous runs into the account', async () => {
    const harness = await makeHarness();
    await seedAnonymousRun(harness, 'beat_purpose_01');
    const signin = capture();
    await signIn(harness, signin);

    const output = capture();
    const code = await runAccountCommand(['sync', 'push'], output.io, harness.options);

    expect(code).toBe(0);
    expect(output.stdout.join('\n')).toContain('Attached 1 local run(s) to octocat');

    const status = capture();
    await runAccountCommand(['sync', 'status'], status.io, harness.options);
    expect(status.stdout.join('\n')).toContain('Account runs: 1');
    expect(status.stdout.join('\n')).toContain('Local runs: 0');
  });

  it('pulls account runs into local progress with merge rules', async () => {
    const harness = await makeHarness();
    const signin = capture();
    const credentials = await signIn(harness, signin);

    const pushed = await harness.app.request('/api/sync/push', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${credentials.token}`,
      },
      body: JSON.stringify({
        runs: [
          {
            tourId: 'tour_bunbun_golden',
            beatId: 'beat_account',
            offsetMs: 900,
            completedBeatIds: ['beat_account'],
            mode: 'listen',
            speed: 1.25,
            updatedAt: 4_000,
          },
        ],
      }),
    });
    expect(pushed.status).toBe(200);

    const output = capture();
    const code = await runAccountCommand(['sync', 'pull'], output.io, harness.options);

    expect(code).toBe(0);
    expect(output.stdout.join('\n')).toContain('Pulled 1 account run(s)');

    const local = await harness.app.request(
      '/api/runs/tour_bunbun_golden?clientId=client-abcdefgh',
    );
    await expect(local.json()).resolves.toMatchObject({
      beatId: 'beat_account',
      offsetMs: 900,
      mode: 'listen',
      speed: 1.25,
      updatedAt: 4_000,
    });
  });

  it('refuses to push without stored credentials', async () => {
    const harness = await makeHarness();
    const output = capture();
    const code = await runAccountCommand(['sync', 'push'], output.io, harness.options);

    expect(code).toBe(1);
    expect(output.stderr.join('\n')).toContain('Not signed in');
  });
});
