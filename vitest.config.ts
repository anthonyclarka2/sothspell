import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'apps/api/**/*.test.ts',
      'apps/cli/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
      'scripts/**/*.test.mjs',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/web/e2e/**'],
    coverage: {
      provider: 'v8',
      // Coverage follows the shipped modules. Browser interaction coverage is
      // the Playwright matrix, not a DOM instrumenter.
      include: [
        'packages/canvas/src/**',
        'packages/analyzer/src/relations.ts',
        'apps/api/src/relations.ts',
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        'packages/canvas/src/test-support.ts',
      ],
      reporter: ['text', 'text-summary'],
      thresholds: {
        'packages/canvas/src/**': { lines: 90, functions: 90, branches: 85 },
        'packages/analyzer/src/relations.ts': { lines: 90 },
        'apps/api/src/relations.ts': { lines: 90 },
      },
    },
  },
});
