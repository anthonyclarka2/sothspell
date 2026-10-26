import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

/**
 * The workflow is a small block-style document. This checks the subset GitHub
 * Actions needs here: top-level keys, even indentation, mapping or sequence
 * entries, and no tabs. It is a structural guard, not a general YAML parser.
 */
function validateWorkflowStructure(source) {
  const lines = source.split(/\r?\n/u);
  const errors = [];
  const topLevel = new Set();
  let sawJobs = false;

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    if (raw.includes('\t')) {
      errors.push(`line ${lineNumber}: tab indentation`);
    }
    if (raw.trim().length === 0 || raw.trimStart().startsWith('#')) {
      return;
    }
    const indent = raw.length - raw.trimStart().length;
    if (indent % 2 !== 0) {
      errors.push(`line ${lineNumber}: odd indentation ${indent}`);
    }
    const content = raw.trimStart();
    if (
      /^[A-Za-z0-9_.-]+:/u.test(content) === false &&
      content.startsWith('- ') === false
    ) {
      errors.push(`line ${lineNumber}: not a mapping or sequence entry`);
    }
    if (indent === 0) {
      const key = content.split(':')[0];
      if (topLevel.has(key)) {
        errors.push(`line ${lineNumber}: duplicate top-level key ${key}`);
      }
      topLevel.add(key);
      if (key === 'jobs') {
        sawJobs = true;
      }
    }
  });

  return { errors, topLevel, sawJobs };
}

describe('Phase 20 command contract', () => {
  it('exposes the coverage, perf, and bundle checks as package scripts', async () => {
    const pkg = JSON.parse(await read('package.json'));

    expect(pkg.scripts['test:coverage']).toBe('vitest run --coverage');
    expect(pkg.scripts['test:canvas:perf']).toBe(
      'playwright test apps/web/e2e/canvas-perf.spec.ts --project=browser',
    );
    expect(pkg.scripts['check:bundle']).toBe('node scripts/check-bundle-budget.mjs');
  });
});

describe('coverage configuration', () => {
  it('measures the canvas modules and both relation services', async () => {
    const { default: config } = await import('../vitest.config.ts');
    const coverage = config.test?.coverage;

    expect(coverage?.provider).toBe('v8');
    expect(coverage?.include).toEqual([
      'packages/canvas/src/**',
      'packages/analyzer/src/relations.ts',
      'apps/api/src/relations.ts',
    ]);
    expect(coverage?.thresholds).toMatchObject({
      'packages/canvas/src/**': { lines: 90, functions: 90, branches: 85 },
      'packages/analyzer/src/relations.ts': { lines: 90 },
      'apps/api/src/relations.ts': { lines: 90 },
    });
  });
});

describe('Playwright configuration', () => {
  it('keeps both projects and makes the browser channel environment-driven', async () => {
    const source = await read('playwright.config.ts');
    const { default: config } = await import('../playwright.config.ts');

    expect(config.projects?.map((project) => project.name).toSorted()).toEqual([
      'a11y',
      'browser',
    ]);
    expect(source).toContain('PLAYWRIGHT_CHANNEL');
    expect(source).toContain('process.env.CI');
  });
});

describe('CI workflow', () => {
  it('is structurally valid and declares every Phase 20 gate', async () => {
    const source = await read('.github/workflows/ci.yml');
    const structure = validateWorkflowStructure(source);

    expect(structure.errors).toEqual([]);
    expect(structure.sawJobs).toBe(true);
    expect([...structure.topLevel]).toEqual(
      expect.arrayContaining(['name', 'on', 'permissions', 'jobs']),
    );

    for (const gate of [
      'pnpm check:secrets',
      'pnpm install --frozen-lockfile',
      'pnpm typecheck',
      'pnpm lint',
      'pnpm test',
      'pnpm build',
      'pnpm check:toolchain',
      'pnpm test:coverage',
      'pnpm check:bundle',
      'pnpm test:browser',
      'pnpm test:a11y',
      'pnpm test:canvas:perf',
      'pnpm exec playwright install',
    ]) {
      expect(source, `CI is missing ${gate}`).toContain(gate);
    }
  });
});
