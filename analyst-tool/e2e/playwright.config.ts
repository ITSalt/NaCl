import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// CI detection
const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,   // specs share a running dev-server; run sequentially to avoid contention
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://127.0.0.1:3582',
    // Slightly generous timeouts — Excalidraw hydrates lazily
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /**
   * webServer boots `npm run dev` from the analyst-tool root, which starts
   * both the Fastify server on :3583 and Vite on :3582 via concurrently.
   * reuseExistingServer=true lets local runs skip the startup penalty.
   */
  webServer: {
    command: `npm run dev --prefix ${path.resolve(__dirname, '..')}`,
    url: 'http://127.0.0.1:3582',
    reuseExistingServer: !isCI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
