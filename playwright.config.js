import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.E2E_PORT || 8765);
// the deployable build (npm run build), served under a sub-path the way GitHub Pages serves it
const SITE_PORT = PORT + 1;
const SITE_DIR = join(tmpdir(), `substitute-site-${SITE_PORT}`);
export const SITE_URL = `http://localhost:${SITE_PORT}/the-substitute-game/`;

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: {
      // software WebGL, so the suite runs on machines and CI runners without a GPU
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: [
    {
      command: `node scripts/serve.mjs ${PORT}`,
      url: `http://localhost:${PORT}/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `node scripts/build-site.mjs "${SITE_DIR}" --base /the-substitute-game/ && node scripts/serve.mjs ${SITE_PORT} --root "${SITE_DIR}" --base /the-substitute-game/`,
      url: SITE_URL,
      reuseExistingServer: false,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
