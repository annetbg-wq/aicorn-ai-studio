import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initBundler } from './lib/bundler'
import { ConfigService } from './services/ConfigService'

// Pre-warm esbuild WASM so the first preview renders instantly
void initBundler()

// Sync config from Supabase on app startup (with error protection)
void ConfigService.syncWithCloud().catch((err) => {
  console.warn('[main.tsx] Sync failed, using local config only:', err)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)