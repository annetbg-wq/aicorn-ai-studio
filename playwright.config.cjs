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
    screenshot: 'only-on-failure',
    video:      'retain-on-failure',
    trace:      'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
