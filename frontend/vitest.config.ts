import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: {
    fs: {
      allow: ['..', '../prototype-bank'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      react: path.resolve(__dirname, './node_modules/react'),
      'react/jsx-runtime': path.resolve(__dirname, './node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(__dirname, './node_modules/react/jsx-dev-runtime.js'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      'framer-motion': path.resolve(__dirname, './node_modules/framer-motion/dist/es/index.mjs'),
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
