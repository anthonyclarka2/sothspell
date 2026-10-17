import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeProject } from './analyze.js';
import { buildProjectBrief, renderProjectBriefMarkdown } from './brief.js';

const roots: string[] = [];

async function makeProject(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sothspell-brief-'));
  roots.push(root);
  for (const directory of [
    'apps/api/src/comments',
    'apps/api/src/sync',
    'apps/web/src',
    'docs',
    'plans',
  ]) {
    await mkdir(path.join(root, directory), { recursive: true });
  }

  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'brief-fixture', private: true }),
  );
  await writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
  await writeFile(
    path.join(root, 'apps', 'api', 'package.json'),
    JSON.stringify({ name: '@brief/api', version: '1.0.0' }),
  );
  await writeFile(
    path.join(root, 'apps', 'web', 'package.json'),
    JSON.stringify({ name: '@brief/web', version: '1.0.0' }),
  );
  await writeFile(
    path.join(root, 'apps', 'api', 'src', 'main.ts'),
    'export function bootstrap(): void {}\n',
  );
  await writeFile(
    path.join(root, 'apps', 'api', 'src', 'comments', 'comments.service.ts'),
    'export class CommentsService { create(): void {} }\n',
  );
  await writeFile(
    path.join(root, 'apps', 'api', 'src', 'sync', 'sync.module.ts'),
    'export class SyncModule {}\n',
  );
  await writeFile(
    path.join(root, 'apps', 'web', 'src', 'main.ts'),
    'export function mount(): void {}\n',
  );
  await writeFile(
    path.join(root, 'docs', 'comments.md'),
    '# Comments\n\nThe comment domain.\n',
  );
  await writeFile(path.join(root, 'plans', 'ROADMAP.md'), '# Roadmap\n\nThe plan.\n');
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('project brief', () => {
  it('identifies the workspace, applications, and feature modules', async () => {
    const root = await makeProject();
    const snapshot = await analyzeProject(root);
    const brief = buildProjectBrief(snapshot);

    expect(brief.workspace.kind).toBe('pnpm');
    expect(brief.applications.map((app) => app.path)).toContain('apps/api');
    expect(brief.applications.map((app) => app.path)).toContain('apps/web');
    expect(brief.featureModules.map((module) => module.name)).toContain('comments');
    expect(brief.featureModules.map((module) => module.name)).toContain('sync');
    expect(brief.docs.some((doc) => doc.path === 'docs/comments.md')).toBe(true);
    expect(brief.plans.some((doc) => doc.path === 'plans/ROADMAP.md')).toBe(true);
  });

  it('renders a deterministic Markdown brief', async () => {
    const root = await makeProject();
    const snapshot = await analyzeProject(root);
    const brief = buildProjectBrief(snapshot);
    const markdown = renderProjectBriefMarkdown(brief);

    expect(markdown).toContain('# brief-fixture');
    expect(markdown).toContain('## Applications');
    expect(markdown).toContain('## Feature modules');
    expect(markdown).toContain('comments');
  });
});
