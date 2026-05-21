import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'frontend/src'),
    },
  },
  test: {
    setupFiles: ['./frontend/src/setupTests.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/*.spec.cjs'],
    environmentMatchGlobs: [
      ['frontend/src/components/**', 'jsdom'],
      ['frontend/src/**', 'node']
    ]
  }
})
