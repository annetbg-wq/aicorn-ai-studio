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
    command: 'npm run dev:all',
    url: 'http://localhost:5183',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_PLAYWRIGHT_TEST: '1',
      VITE_SUPABASE_URL: 'https://zdzuaodphrlpvorutpyc.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkenVhb2RwaHJscHZvcnV0cHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDIyMTIsImV4cCI6MjA4NzUxODIxMn0.7L5sYMedvIKnU7o0X280Y92rUTAs86Q4RwBJsppuFxI',
    },
  },
});
