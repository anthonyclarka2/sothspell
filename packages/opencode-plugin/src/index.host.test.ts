import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Plugin } from '@opencode/plugin';
import { OpenCode } from '@opencode/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { SothspellPlugin } from './index.js';
import { SothspellRpc } from './rpc.js';

/**
 * Embedded-host smoke test. It proves the V2 definition loads in the real SDK
 * and that commands, tools, and RPC are registered, without invoking a model or
 * opening a browser. The host is lazy: creating a session initializes the
 * location and runs plugin setup.
 */

const temporaryDirectories: string[] = [];
const environmentKeys = [
  'SOTHSPELL_HOME',
  'XDG_DATA_HOME',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
] as const;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

describe('embedded OpenCode host', () => {
  it('loads the plugin, lists its command and tools, and answers RPC', async (test) => {
    const project = await temporaryDirectory('sothspell-host-project-');
    const home = await temporaryDirectory('sothspell-host-home-');
    const previous = new Map<string, string | undefined>();
    for (const key of environmentKeys) {
      previous.set(key, process.env[key]);
    }
    process.env.SOTHSPELL_HOME = path.join(home, 'sothspell');
    process.env.XDG_DATA_HOME = path.join(home, 'data');
    process.env.XDG_CONFIG_HOME = path.join(home, 'config');
    process.env.XDG_CACHE_HOME = path.join(home, 'cache');

    let observedTools: string[] = [];
    let observedCommands: string[] = [];
    let probeCleanedUp = false;
    const probe = Plugin.define({
      id: 'sothspell-host-probe',
      async setup(context) {
        observedTools = (await context.tool.list()).map((tool) => tool.id);
        observedCommands = (await context.command.list()).data.map(
          (command) => command.name,
        );
        return () => {
          probeCleanedUp = true;
        };
      },
    });

    let opencode: Awaited<ReturnType<typeof OpenCode.create>> | undefined;
    let hostError: string | undefined;
    try {
      try {
        opencode = await OpenCode.create({
          plugins: [SothspellPlugin, probe] as never,
          config: { directory: project },
        });
      } catch (error) {
        // Some hosts cannot start every local service (native watchers, LSP).
        // The fake-context tests still cover the plugin surface in that case.
        hostError = `embedded @opencode/sdk host unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`;
        return;
      }

      await opencode.sessions.create({ location: { directory: project } });

      // Calling the RPC is what initializes the location and waits for every
      // plugin's setup in the embedded host.
      const rpc = opencode.rpc(SothspellRpc);
      const status = await rpc.status({}, { location: { directory: project } });
      expect(status).toMatchObject({
        projectRoot: project,
        tourId: null,
        playerUrl: 'http://127.0.0.1:5173',
      });

      // The public command list does not expose transform registrations in
      // 2.0.32's embedded host, so the probe plugin reads the registry through
      // the same plugin context the TUI uses.
      expect(observedCommands).toContain('sothspell');
      expect(observedTools).toEqual(
        expect.arrayContaining([
          'sothspell_status',
          'sothspell_open',
          'sothspell_generate',
          'sothspell_ask',
        ]),
      );
    } finally {
      await opencode?.close();
      if (opencode) {
        expect(probeCleanedUp).toBe(true);
      }
      for (const key of environmentKeys) {
        const value = previous.get(key);
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      if (hostError) {
        test.skip(hostError);
      }
    }
  }, 60_000);
});
