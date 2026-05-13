import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: {
    fs: {
      allow: ['..', '../prototype-bank'],
    },
  },
  test: {
    setupFiles: ['./src/setupTests.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/*.spec.cjs'],
    environmentMatchGlobs: [
      ['src/components/**', 'jsdom'], // для React тестов
      ['src/**', 'node'] // для сервисов
    ]
  }
})
