import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * The embed is a separate build from the web app on purpose: it must not grow
 * the API client, the router, SQLite, a highlighter, or a diagram engine. The
 * guard plugin fails the build when one of those modules enters the graph, and
 * the size plugin fails it when the shipped files outgrow the budget.
 */

const JS_BUDGET_BYTES = 420 * 1024;
const CSS_BUDGET_BYTES = 20 * 1024;

/** Runtime modules the embed must never bundle, matched by module id. */
const FORBIDDEN_MODULES = [
  'shiki',
  'elkjs',
  'idb',
  'better-sqlite3',
  'hono',
  '@hono/node-server',
  '@sothspell/api',
  '@sothspell/analyzer',
  '@sothspell/authoring',
  '@sothspell/opencode-plugin',
  '@tanstack/react-router',
  '@tanstack/react-virtual',
  '@xyflow/react',
  '@phosphor-icons/react',
  'motion',
];

/** Distinctive identifiers that only appear if one of those modules inlined. */
const FORBIDDEN_MARKERS = [
  'createHighlighter',
  'better-sqlite3',
  '@sothspell/api',
  'elk.bundled',
  '@xyflow',
];

function guardImports(): Plugin {
  return {
    name: 'sothspell-embed-guard-imports',
    apply: 'build',
    enforce: 'pre',
    resolveId(source) {
      for (const forbidden of FORBIDDEN_MODULES) {
        if (source === forbidden || source.startsWith(`${forbidden}/`)) {
          this.error(
            `the embed bundle must not import ${source}; it is a player-only build`,
          );
        }
      }
      return null;
    },
    generateBundle(_options, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== 'chunk') {
          continue;
        }
        for (const marker of FORBIDDEN_MARKERS) {
          if (output.code.includes(marker)) {
            this.error(`the embed bundle contains ${marker} in ${fileName}`);
          }
        }
      }
    },
  };
}

function formatKiB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function sizeBudget(): Plugin {
  return {
    name: 'sothspell-embed-size-budget',
    apply: 'build',
    async closeBundle() {
      const outDir = path.resolve(fileURLToPath(new URL('./dist', import.meta.url)));
      const report: string[] = [];
      for (const [file, budget] of [
        ['player.js', JS_BUDGET_BYTES],
        ['player.css', CSS_BUDGET_BYTES],
      ] as const) {
        const filePath = path.join(outDir, file);
        const [contents, stats] = await Promise.all([readFile(filePath), stat(filePath)]);
        if (contents.length > budget) {
          this.error(
            `${file} is ${formatKiB(stats.size)}, over the ${formatKiB(budget)} budget`,
          );
        }
        report.push(
          `${file}: ${formatKiB(stats.size)} (${formatKiB(gzipSync(contents).length)} gzip), budget ${formatKiB(budget)}`,
        );
      }
      this.info(`embed bundle size — ${report.join('; ')}`);
    },
  };
}

export default defineConfig({
  plugins: [guardImports(), react(), sizeBudget()],
  // Library builds keep `process.env.NODE_ENV` for consumers by default; React
  // would then bundle both its development and production builds. The embed is
  // always a shipped artifact, so production is the only correct branch.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/entry.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'player.js',
      cssFileName: 'player',
    },
  },
});
