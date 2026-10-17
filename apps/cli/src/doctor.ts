import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createRunStore } from '@sothspell/api/runs';
import type { CliIO } from './cli.js';

const execFileAsync = promisify(execFile);

export interface DoctorCheck {
  name: string;
  ok: boolean;
  required: boolean;
  detail: string;
}

export interface DoctorOptions {
  home?: string;
  bunbunRoot?: string;
  port?: number;
}

async function portAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

export async function collectDoctorReport(
  options: DoctorOptions = {},
): Promise<DoctorCheck[]> {
  const home =
    options.home ?? process.env.SOTHSPELL_HOME ?? path.join(os.homedir(), '.sothspell');
  const bunbunRoot =
    options.bunbunRoot ??
    process.env.SOTHSPELL_PROJECT_ROOT ??
    '/Users/ajc/Projects/codegens/bunbun';
  const checks: DoctorCheck[] = [];

  checks.push({
    name: 'node',
    ok: Number(process.versions.node.split('.')[0]) >= 26,
    required: true,
    detail: `Node ${process.versions.node}`,
  });

  try {
    const { stdout } = await execFileAsync('pnpm', ['exec', 'tsc', '--version']);
    checks.push({
      name: 'typescript',
      ok: /Version 7\./.test(stdout),
      required: true,
      detail: stdout.trim(),
    });
  } catch (error) {
    checks.push({
      name: 'typescript',
      ok: false,
      required: true,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await mkdir(home, { recursive: true });
    const probe = path.join(home, '.doctor-probe');
    await writeFile(probe, 'ok', 'utf8');
    await rm(probe, { force: true });
    checks.push({
      name: 'sothspell-home',
      ok: true,
      required: true,
      detail: home,
    });
  } catch (error) {
    checks.push({
      name: 'sothspell-home',
      ok: false,
      required: true,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const store = createRunStore(':memory:');
    store.close();
    checks.push({
      name: 'sqlite',
      ok: true,
      required: true,
      detail: 'better-sqlite3 loaded',
    });
  } catch (error) {
    checks.push({
      name: 'sqlite',
      ok: false,
      required: true,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  checks.push({
    name: 'bunbun-checkout',
    ok: existsSync(bunbunRoot),
    required: false,
    detail: bunbunRoot,
  });
  checks.push({
    name: 'model',
    ok: Boolean(process.env.SOTHSPELL_MODEL),
    required: false,
    detail: process.env.SOTHSPELL_MODEL ?? 'SOTHSPELL_MODEL is unset',
  });
  checks.push({
    name: 'elevenlabs',
    ok: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
    required: false,
    detail:
      process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID
        ? 'configured'
        : 'ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID are unset',
  });

  const available = await portAvailable(options.port ?? 4319);
  checks.push({
    name: 'port',
    ok: available,
    required: false,
    detail: available ? '4319 is free' : '4319 is already in use',
  });

  return checks;
}

export async function runDoctor(options: DoctorOptions, io: CliIO): Promise<number> {
  const checks = await collectDoctorReport(options);
  let failed = false;
  for (const check of checks) {
    const marker = check.ok ? 'ok' : check.required ? 'fail' : 'warn';
    if (!check.ok && check.required) {
      failed = true;
    }
    io.stdout(`${marker.padEnd(4)} ${check.name.padEnd(18)} ${check.detail}`);
  }
  return failed ? 1 : 0;
}
