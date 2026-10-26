#!/usr/bin/env node
/**
 * Keeps every workspace manifest and the checked-in plugin manifests on one
 * release version. The root package is the source of truth; `--check` runs in CI
 * so a release cannot ship a mixed tree.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const requested = args.find((arg) => arg !== '--check');
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

async function packageFiles(group) {
  const directory = path.join(root, group);
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directory, entry.name, 'package.json'))
    .filter((file) => existsSync(file));
}

const files = [
  path.join(root, 'package.json'),
  ...(await packageFiles('apps')),
  ...(await packageFiles('packages')),
  path.join(root, 'packages/harness-claude-code/plugin/.claude-plugin/plugin.json'),
  path.join(root, 'packages/harness-codex/plugin/plugin.json'),
];

const rootManifest = JSON.parse(await readFile(files[0], 'utf8'));
const version = requested ?? rootManifest.version;

if (!semver.test(version)) {
  console.error(`Expected a semver version, found: ${version}`);
  process.exit(1);
}

const findings = [];
let changed = 0;

for (const file of files) {
  const relative = path.relative(root, file);
  const manifest = JSON.parse(await readFile(file, 'utf8'));

  if (manifest.version !== version) {
    findings.push(`${relative}: ${manifest.version} → ${version}`);
    manifest.version = version;
  }

  if (path.basename(file) === 'package.json') {
    if (manifest.license !== 'MIT') {
      findings.push(`${relative}: license ${manifest.license ?? 'missing'} → MIT`);
    }
    // Keep the public license beside `private`, where readers expect it.
    const ordered = {};
    let inserted = false;
    for (const [key, value] of Object.entries(manifest)) {
      ordered[key] = value;
      if (key === 'private') {
        ordered.license = 'MIT';
        inserted = true;
      }
    }
    if (!inserted) {
      ordered.license = 'MIT';
    }
    for (const key of Object.keys(manifest)) {
      delete manifest[key];
    }
    Object.assign(manifest, ordered);
  }

  if (checkOnly) {
    continue;
  }

  const before = await readFile(file, 'utf8');
  const after = `${JSON.stringify(manifest, null, 2)}\n`;
  if (before !== after) {
    await writeFile(file, after, 'utf8');
    changed += 1;
  }
}

if (findings.length > 0) {
  const message = [
    checkOnly ? 'Version check failed:' : `Updated ${changed} manifest(s):`,
    ...findings.map((finding) => `- ${finding}`),
  ].join('\n');
  if (checkOnly) {
    console.error(message);
    process.exit(1);
  }
  console.log(message);
}

if (checkOnly) {
  console.log(`All ${files.length} manifests are at ${version} with the MIT license.`);
}
