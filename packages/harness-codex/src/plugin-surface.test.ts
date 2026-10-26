import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The checked-in Codex plugin surface. These files are what a local marketplace
 * install loads; the test keeps the portable manifest, skill, hooks, and
 * scripts wired to each other.
 */

const pluginRoot = path.join(import.meta.dirname, '..', 'plugin');

async function readJson(relative: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(pluginRoot, relative), 'utf8')) as Record<
    string,
    unknown
  >;
}

async function packageVersion(): Promise<string> {
  const manifest = JSON.parse(
    await readFile(path.join(pluginRoot, '..', 'package.json'), 'utf8'),
  ) as { version: string };
  return manifest.version;
}

describe('Codex plugin surface', () => {
  it('ships a portable Agent Plugins manifest with the OpenAI overlay', async () => {
    const manifest = await readJson('plugin.json');
    expect(manifest.name).toBe('sothspell');
    expect(manifest.version).toBe(await packageVersion());
    expect(String(manifest.$schema)).toContain('agent-plugins.org');
    const openai = (manifest.extensions as Record<string, unknown>)['com.openai'] as {
      hooks?: string;
      interface?: { displayName?: string; category?: string };
    };
    expect(openai.hooks).toBe('./hooks/hooks.json');
    expect(openai.interface?.displayName).toBe('Sóþspell');
    expect(openai.interface?.category).toBe('Productivity');
  });

  it('ships a skill with the required frontmatter and the four verbs', async () => {
    const skill = await readFile(
      path.join(pluginRoot, 'skills', 'sothspell', 'SKILL.md'),
      'utf8',
    );
    expect(skill.startsWith('---\n')).toBe(true);
    expect(skill).toMatch(/\nname: sothspell\n/u);
    expect(skill).toMatch(/\ndescription: .+walkthrough/u);
    expect(skill).toContain('sothspell.sh" status');
    expect(skill).toContain('sothspell.sh" generate');
    expect(skill).toContain('sothspell.sh" open');
    expect(skill).toContain('sothspell.sh" ask');
    expect(skill).toContain('PLUGIN_ROOT');
    expect(skill).toContain('sothspell serve');
  });

  it('registers a SessionStart hook that runs the bundled script', async () => {
    const hooks = await readJson('hooks/hooks.json');
    const groups = (hooks.hooks as Record<string, unknown>).SessionStart as Array<{
      hooks: Array<{ type: string; command: string }>;
    }>;
    expect(groups).toHaveLength(1);
    const handler = groups[0]?.hooks[0];
    expect(handler?.type).toBe('command');
    expect(handler?.command).toContain('$PLUGIN_ROOT/scripts/sothspell.sh');
    expect(handler?.command).toContain('hook session-start');
  });

  it('ships an executable wrapper and the adapter entrypoint', async () => {
    const wrapper = path.join(pluginRoot, 'scripts', 'sothspell.sh');
    const info = await stat(wrapper);
    expect(info.mode & 0o111).not.toBe(0);

    const script = await readFile(wrapper, 'utf8');
    expect(script).toContain('exec pnpm --dir "$repo" exec tsx "$here/cli.ts" "$@"');
    expect(script).toContain('$here/../../../..');

    const entry = await readFile(path.join(pluginRoot, 'scripts', 'cli.ts'), 'utf8');
    expect(entry).toContain("from '../../src/cli.js'");
    expect(entry).toContain('runCodexCli');
  });

  it('keeps every hook path inside the plugin root', async () => {
    const hooks = await readJson('hooks/hooks.json');
    const serialized = JSON.stringify(hooks);
    expect(serialized).not.toContain('../');
    expect(serialized).toContain('$PLUGIN_ROOT');
  });
});
