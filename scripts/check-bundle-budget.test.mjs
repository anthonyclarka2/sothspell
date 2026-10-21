import { describe, expect, it } from 'vitest';
import {
  CANVAS_GZIP_BUDGET,
  EXPORT_GZIP_BUDGET,
  evaluateBundleBudget,
} from './check-bundle-budget.mjs';

function asset(name, gzipBytes, bytes = gzipBytes * 3) {
  return { name, bytes, gzipBytes };
}

describe('evaluateBundleBudget', () => {
  it('records the total and says the split budgets are not measurable', () => {
    const report = evaluateBundleBudget([
      asset('index-aaa.js', 238 * 1024, 810 * 1024),
      asset('index-aaa.js.map', 10, 10),
      asset('index-aaa.css', 15 * 1024),
    ]);

    expect(report.ok).toBe(true);
    expect(report.measuredCanvas).toBe(false);
    expect(report.measuredExport).toBe(false);
    expect(report.total.files).toEqual(['index-aaa.js']);
    expect(report.notes.join(' ')).toMatch(/not measurable until code splitting/u);
    expect(report.notes.join(' ')).toMatch(/dynamic import splitting/u);
  });

  it('passes once a canvas chunk exists within the 60 KiB gzip budget', () => {
    const report = evaluateBundleBudget([
      asset('index-aaa.js', 200 * 1024),
      asset('CanvasView-bbb.js', CANVAS_GZIP_BUDGET),
      asset('modern-screenshot-ccc.js', EXPORT_GZIP_BUDGET),
    ]);

    expect(report.ok).toBe(true);
    expect(report.measuredCanvas).toBe(true);
    expect(report.canvas?.gzipBytes).toBe(CANVAS_GZIP_BUDGET);
    expect(report.exportChunk?.gzipBytes).toBe(EXPORT_GZIP_BUDGET);
  });

  it('fails a canvas chunk over budget', () => {
    const report = evaluateBundleBudget([
      asset('index-aaa.js', 200 * 1024),
      asset('CanvasView-bbb.js', CANVAS_GZIP_BUDGET + 1),
    ]);

    expect(report.ok).toBe(false);
    expect(report.violations.join(' ')).toMatch(/canvas chunk/u);
  });

  it('fails an export chunk over budget', () => {
    const report = evaluateBundleBudget([
      asset('index-aaa.js', 200 * 1024),
      asset('modern-screenshot-ccc.js', EXPORT_GZIP_BUDGET + 1),
    ]);

    expect(report.ok).toBe(false);
    expect(report.violations.join(' ')).toMatch(/export chunk/u);
  });
});
