import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectDoctorReport, runDoctor } from './doctor.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('sothspell doctor', () => {
  it('reports the required runtime checks', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'sothspell-doctor-'));
    roots.push(home);
    const checks = await collectDoctorReport({
      home,
      bunbunRoot: '/nonexistent/bunbun',
      port: 0,
    });

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'node', ok: true, required: true }),
        expect.objectContaining({ name: 'typescript', ok: true, required: true }),
        expect.objectContaining({ name: 'sothspell-home', ok: true }),
        expect.objectContaining({ name: 'sqlite', ok: true }),
        expect.objectContaining({ name: 'project-root', ok: false, required: false }),
      ]),
    );
  });

  it('prints a marker for every check', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'sothspell-doctor-'));
    roots.push(home);
    const lines: string[] = [];
    const code = await runDoctor(
      { home, bunbunRoot: '/nonexistent/bunbun', port: 0 },
      { stdout: (line) => lines.push(line), stderr: () => undefined },
    );

    expect(code).toBe(0);
    expect(lines.join('\n')).toMatch(/ok\s+node/);
    expect(lines.join('\n')).toMatch(/warn\s+project-root/);
  });
});
