import { defineConfig, devices } from '@playwright/test';

// Ports are overridable so parallel worktrees can run their own servers instead
// of sharing (or fighting over) the documented dev ports.
const webPort = Number(process.env.SOTHSPELL_WEB_PORT ?? 5173);
const apiPort = Number(process.env.SOTHSPELL_API_PORT ?? 4319);

export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'on-first-retry',
    channel: 'chrome',
  },
  webServer: [
    {
      command: 'pnpm --filter @sothspell/api dev',
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: String(apiPort),
        SOTHSPELL_PROJECT_ROOT:
          process.env.SOTHSPELL_PROJECT_ROOT ?? '/Users/ajc/Projects/codegens/bunbun',
      },
    },
    {
      command: 'pnpm --filter @sothspell/web dev',
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        SOTHSPELL_WEB_PORT: String(webPort),
        SOTHSPELL_API_PORT: String(apiPort),
      },
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
