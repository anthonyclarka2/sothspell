import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'apps/api/**/*.test.ts',
      'apps/cli/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/web/e2e/**'],
  },
});
