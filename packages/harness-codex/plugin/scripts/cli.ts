#!/usr/bin/env tsx
import { runCodexCli } from '../../src/cli.js';

/**
 * Thin entrypoint the plugin's shell wrapper runs. It keeps the plugin files
 * free of behavior: the adapter package owns the commands and hooks.
 */
const code = await runCodexCli(process.argv.slice(2), {
  stdout: (line) => {
    process.stdout.write(`${line}\n`);
  },
  stderr: (line) => {
    process.stderr.write(`${line}\n`);
  },
});

process.exitCode = code;
