// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const isLivePreviewCanary =
  process.env.PLAYWRIGHT_PRODUCTION_ARTIFACT === '1' ||
  process.argv.some(arg => arg.includes('@preview-live-canary'));

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
    command: isLivePreviewCanary ? 'npm run prod:canary:all' : 'npm run dev:all',
    // Non-canary: launcher boots backend first, then frontend — :5183 implies backend ready.
    // Live canary: prod:canary:all uses concurrently (no ordering); probe the backend health
    // endpoint directly so tests cannot start before the API layer is ready.
    url: isLivePreviewCanary
      ? 'http://127.0.0.1:3000/api/health'
      : 'http://localhost:5183',
    reuseExistingServer: !process.env.CI,
    timeout: isLivePreviewCanary ? 240_000 : 120_000,
    env: {
      VITE_PLAYWRIGHT_TEST: '1',
      VITE_SUPABASE_URL: 'https://zdzuaodphrlpvorutpyc.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpkenVhb2RwaHJscHZvcnV0cHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDIyMTIsImV4cCI6MjA4NzUxODIxMn0.7L5sYMedvIKnU7o0X280Y92rUTAs86Q4RwBJsppuFxI',
    },
  },
});
