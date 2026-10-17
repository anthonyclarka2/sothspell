import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    channel: 'chrome',
  },
  webServer: [
    {
      command: 'pnpm --filter @sothspell/api dev',
      url: 'http://127.0.0.1:4319/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        SOTHSPELL_PROJECT_ROOT:
          process.env.SOTHSPELL_PROJECT_ROOT ?? '/Users/ajc/Projects/codegens/bunbun',
      },
    },
    {
      command: 'pnpm --filter @sothspell/web dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'browser',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /a11y\.spec\.ts/,
    },
    {
      name: 'a11y',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /a11y\.spec\.ts/,
    },
  ],
});
