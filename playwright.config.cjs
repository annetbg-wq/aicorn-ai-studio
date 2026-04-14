// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir:  './e2e',
  timeout:  60_000,
  retries:  1,
  workers:  1,           // sequential — avoids port collisions on CI
  reporter: 'line',

  use: {
    baseURL:    process.env.STUDIO_URL ?? 'http://localhost:5183',
    headless:   true,
    storageState: undefined,
    screenshot: 'only-on-failure',
    video:      'retain-on-failure',
    trace:      'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'npm run dev:frontend && npm run dev:backend',
    url: 'http://localhost:5183',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      VITE_PLAYWRIGHT_TEST: '1',
    },
  },
});
