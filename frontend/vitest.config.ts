import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const REACT_INDEX = path.resolve(__dirname, './node_modules/react/index.js');
const REACT_JSX   = path.resolve(__dirname, './node_modules/react/jsx-runtime.js');

// Vite's alias resolver doesn't apply when files outside the project root
// (prototype-bank) are transformed. This plugin bridges the gap so that bare
// `import React from 'react'` inside preview-adapter .tsx files resolves to
// the same React copy used by the rest of the project.
const resolvePrototypeBankReact = {
  name: 'resolve-prototype-bank-react',
  resolveId(source: string, importer: string | undefined) {
    if (!importer?.includes('prototype-bank')) return;
    if (source === 'react')             return REACT_INDEX;
    if (source === 'react/jsx-runtime') return REACT_JSX;
  },
};

export default defineConfig({
  plugins: [react(), resolvePrototypeBankReact],
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
    exclude: ['**/node_modules/**', '**/e2e/**', '**/*.spec.cjs', '**/*.runner.test.ts'],
    testTimeout: 15000,
    environmentMatchGlobs: [
      ['src/components/**', 'jsdom'], // для React тестов
      ['src/**', 'node'] // для сервисов
    ]
  }
})
