import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: path.resolve(__dirname, '..'),
  test: {
    environment: 'node',
    include: ['backend/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
