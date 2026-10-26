import { defineConfig, devices } from '@playwright/test';

// Ports are overridable so parallel worktrees can run their own servers instead
// of sharing (or fighting over) the documented dev ports.
const webPort = Number(process.env.SOTHSPELL_WEB_PORT ?? 5173);
const apiPort = Number(process.env.SOTHSPELL_API_PORT ?? 4319);

// The live Bunbun acceptance specs resolve the same read-only checkout. CI has
// no checkout, so those specs skip instead of pointing the server at a path
// that does not exist.
const bunbunRoot =
  process.env.BUNBUN_ROOT ??
  process.env.SOTHSPELL_PROJECT_ROOT ??
  '/Users/ajc/Projects/codegens/bunbun';

// Local runs use the installed Chrome channel; CI sets PLAYWRIGHT_CHANNEL to an
// empty string so Playwright uses its bundled Chromium and does not depend on a
// system browser. An explicit value still wins for other local or hosted runs.
const configuredChannel = process.env.PLAYWRIGHT_CHANNEL?.trim();
const channel = configuredChannel === '' ? undefined : (configuredChannel ?? 'chrome');

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
    ...(channel === undefined ? {} : { channel }),
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
        SOTHSPELL_PROJECT_ROOT: bunbunRoot,
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
