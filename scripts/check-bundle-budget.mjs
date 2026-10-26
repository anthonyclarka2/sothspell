#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * Checks the built web bundle against the Phase 20 canvas budgets. The canvas
 * and image-export budgets are only meaningful once Vite emits separate
 * chunks; today it emits one app chunk. This script records that honestly
 * instead of pretending the unsplit bundle passed a 60 KiB canvas gate.
 */

export const CANVAS_GZIP_BUDGET = 60 * 1024;
export const EXPORT_GZIP_BUDGET = 40 * 1024;

const CANVAS_CHUNK = /canvas/iu;
const EXPORT_CHUNK = /(?:export|screenshot)/iu;

function bytesLabel(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

function chunkSummary(files) {
  const bytes = files.reduce((total, file) => total + file.bytes, 0);
  const gzipBytes = files.reduce((total, file) => total + file.gzipBytes, 0);
  return { files: files.map((file) => file.name), bytes, gzipBytes };
}

/**
 * Pure so the budget rules can be tested without a real build. `assets` are
 * JavaScript files with their raw and gzip sizes.
 */
export function evaluateBundleBudget(assets) {
  const javascript = assets.filter((asset) => asset.name.endsWith('.js'));
  const total = chunkSummary(javascript);
  const canvasFiles = javascript.filter((asset) => CANVAS_CHUNK.test(asset.name));
  const exportFiles = javascript.filter(
    (asset) => EXPORT_CHUNK.test(asset.name) && !CANVAS_CHUNK.test(asset.name),
  );
  const violations = [];
  const notes = [];

  let canvas = null;
  if (canvasFiles.length === 0) {
    notes.push(
      'no canvas-specific chunk is emitted; the 60 KiB canvas budget is not measurable until code splitting',
    );
  } else {
    canvas = chunkSummary(canvasFiles);
    if (canvas.gzipBytes > CANVAS_GZIP_BUDGET) {
      violations.push(
        `canvas chunk is ${bytesLabel(canvas.gzipBytes)} gzip, over the ${bytesLabel(CANVAS_GZIP_BUDGET)} budget`,
      );
    }
  }

  let exportChunk = null;
  if (exportFiles.length === 0) {
    notes.push(
      'no image-export chunk is emitted; the 40 KiB export budget is not measurable until dynamic import splitting',
    );
  } else {
    exportChunk = chunkSummary(exportFiles);
    if (exportChunk.gzipBytes > EXPORT_GZIP_BUDGET) {
      violations.push(
        `export chunk is ${bytesLabel(exportChunk.gzipBytes)} gzip, over the ${bytesLabel(EXPORT_GZIP_BUDGET)} budget`,
      );
    }
  }

  return {
    ok: violations.length === 0,
    measuredCanvas: canvas !== null,
    measuredExport: exportChunk !== null,
    total,
    canvas,
    exportChunk,
    canvasBudgetBytes: CANVAS_GZIP_BUDGET,
    exportBudgetBytes: EXPORT_GZIP_BUDGET,
    violations,
    notes,
  };
}

async function readAssets(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const assets = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    const info = await stat(filePath);
    const bytes = await readFile(filePath);
    assets.push({
      name: entry.name,
      bytes: info.size,
      gzipBytes: gzipSync(bytes).length,
    });
  }
  return assets;
}

function printReport(report) {
  console.log(
    `[canvas-bundle] total JavaScript ${bytesLabel(report.total.bytes)} raw, ${bytesLabel(report.total.gzipBytes)} gzip`,
  );
  if (report.canvas) {
    console.log(
      `[canvas-bundle] canvas ${report.canvas.files.join(', ')}: ${bytesLabel(report.canvas.bytes)} raw, ${bytesLabel(report.canvas.gzipBytes)} gzip (budget ${bytesLabel(report.canvasBudgetBytes)})`,
    );
  }
  if (report.exportChunk) {
    console.log(
      `[canvas-bundle] export ${report.exportChunk.files.join(', ')}: ${bytesLabel(report.exportChunk.bytes)} raw, ${bytesLabel(report.exportChunk.gzipBytes)} gzip (budget ${bytesLabel(report.exportBudgetBytes)})`,
    );
  }
  for (const note of report.notes) {
    console.log(`[canvas-bundle] note: ${note}`);
  }
  for (const violation of report.violations) {
    console.error(`[canvas-bundle] FAIL: ${violation}`);
  }
  if (report.ok) {
    console.log(
      report.measuredCanvas || report.measuredExport
        ? '[canvas-bundle] measured chunks are within budget'
        : '[canvas-bundle] budget not measured; current total recorded above',
    );
  }
}

async function main() {
  const distIndex = process.argv.indexOf('--dist');
  const dist =
    distIndex === -1 ? 'apps/web/dist' : (process.argv[distIndex + 1] ?? 'apps/web/dist');
  const assetsDirectory = path.join(dist, 'assets');

  let assets;
  try {
    assets = await readAssets(assetsDirectory);
  } catch {
    console.error(
      `[canvas-bundle] no build output at ${assetsDirectory}; run pnpm build first`,
    );
    process.exitCode = 1;
    return;
  }

  const report = evaluateBundleBudget(assets);
  printReport(report);
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
