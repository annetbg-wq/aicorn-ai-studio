import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3100,
    strictPort: true,
    host: true,
    cors: true,
    hmr: { overlay: false },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
