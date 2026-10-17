import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * The embed browser suite runs against the static docs fixture, not the web
 * app: the whole point of the embed is that it plays without the Sóþspell
 * server. The webServer command builds the bundle, exports the golden tour,
 * and serves the fixture on its own port.
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4320',
    trace: 'on-first-retry',
    channel: 'chrome',
  },
  webServer: {
    command:
      'pnpm build:embed && pnpm sothspell export examples/bunbun-tour/tour.json --embed --out examples/embed-docs/dist/sothspell && node examples/embed-docs/serve.mjs',
    cwd: repoRoot,
    url: 'http://127.0.0.1:4320/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'embed-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'embed-mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
