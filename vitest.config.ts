import { defineConfig } from 'vitest/config'
import path from 'path'

// React lives inside frontend/node_modules. Prototype-bank preview-adapter TSX
// files do bare `import React from 'react'` — without this plugin they resolve
// to a different copy (or fail) when run from the repo root, causing silent
// empty renders in PremiumComponentBankService and VisualBankModule tests.
const REACT_INDEX = path.resolve(__dirname, './frontend/node_modules/react/index.js');
const REACT_JSX   = path.resolve(__dirname, './frontend/node_modules/react/jsx-runtime.js');

const resolvePrototypeBankReact = {
  name: 'resolve-prototype-bank-react',
  resolveId(source: string, importer: string | undefined) {
    if (!importer?.includes('prototype-bank')) return;
    if (source === 'react')             return REACT_INDEX;
    if (source === 'react/jsx-runtime') return REACT_JSX;
  },
};

export default defineConfig({
  root: path.resolve(__dirname, './frontend'),
  plugins: [resolvePrototypeBankReact],
  server: {
    fs: {
      // Mirrors frontend/vitest.config.ts exactly. From root=./frontend:
      //   '..'              → repo root  (C:\ai_studio)
      //   '../prototype-bank' → prototype-bank tree
      allow: ['..', '../prototype-bank'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'frontend/src'),
      // Mirror the frontend config: pin all React imports (including those inside
      // prototype-bank files that Vite resolves from the repo root) to the single
      // copy installed in frontend/node_modules, avoiding duplicate-React errors.
      'react': path.resolve(__dirname, './frontend/node_modules/react'),
      'react/jsx-runtime': path.resolve(__dirname, './frontend/node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(__dirname, './frontend/node_modules/react/jsx-dev-runtime.js'),
      'react-dom': path.resolve(__dirname, './frontend/node_modules/react-dom'),
      'framer-motion': path.resolve(__dirname, './frontend/node_modules/framer-motion/dist/es/index.mjs'),
    },
  },
  test: {
    setupFiles: [path.resolve(__dirname, 'frontend/src/setupTests.ts')],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/*.spec.cjs'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    environmentMatchGlobs: [
      // With root=./frontend, test paths are relative to frontend/ (src/...)
      ['src/components/**', 'jsdom'],
      ['src/**', 'node'],
    ]
  }
})
