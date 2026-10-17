#!/usr/bin/env node
/**
 * Guards the TypeScript 7 decision. TS 7.0 ships without the classic compiler
 * API, so a tool that imports `typescript` for AST work would break the
 * analyzer, the build, or both. The guard fails early with a named package
 * instead of letting a dependency change the architecture silently.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const banned = [
  'ts-morph',
  'vite-tsconfig-paths',
  'typescript-estree',
  '@typescript-eslint/typescript-estree',
];

function packageFiles() {
  const files = [];
  for (const group of ['apps', 'packages']) {
    const directory = path.join(root, group);
    if (!existsSync(directory)) {
      continue;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const file = path.join(directory, entry.name, 'package.json');
        if (existsSync(file)) {
          files.push(file);
        }
      }
    }
  }
  files.push(path.join(root, 'package.json'));
  return files;
}

const tscVersion = execFileSync('pnpm', ['exec', 'tsc', '--version'], {
  cwd: root,
  encoding: 'utf8',
}).trim();

if (!/Version 7\./.test(tscVersion)) {
  console.error(`Expected TypeScript 7, found: ${tscVersion}`);
  process.exit(1);
}

const findings = [];
for (const file of packageFiles()) {
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
  };
  for (const name of banned) {
    if (dependencies[name]) {
      findings.push(`${path.relative(root, file)} depends on ${name}`);
    }
  }
}

if (findings.length > 0) {
  console.error('The TypeScript 7 toolchain guard found banned packages:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(
  `TypeScript 7 toolchain OK (${tscVersion}); no classic compiler API packages.`,
);
