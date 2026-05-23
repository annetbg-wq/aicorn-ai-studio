import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'preview-dev-ops',
      configureServer(server) {
        const setCors = (res: import('http').ServerResponse) => {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        };

        server.middlewares.use('/__install_deps', (req, res) => {
          setCors(res);
          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method Not Allowed');
            return;
          }

          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body || '{}') as { packages?: string[] };
              const packages = Array.isArray(parsed.packages) ? parsed.packages.filter(Boolean) : [];

              if (packages.length === 0) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ installed: [] }));
                return;
              }

              const { execSync } = await import('child_process');
              const previewRoot = path.resolve(__dirname);

              console.log('[preview-server] Installing deps:', packages);
              execSync(
                `npm install ${packages.join(' ')} --save --legacy-peer-deps --no-package-lock`,
                {
                  cwd: previewRoot,
                  stdio: 'pipe',
                  timeout: 60_000,
                },
              );

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ installed: packages }));
              console.log('[preview-server] Deps installed:', packages);
            } catch (err) {
              console.error('[preview-server] Deps install error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
        });
      },
    },
  ],
  server: {
    // port and strictPort are intentionally absent — passed via CLI:
    //   npx vite --port {port} --strictPort
    host: true,
    cors: true,
    hmr: {
      protocol: 'ws',
      overlay: false,
    },
    watch: {
      // Polling is required when files are written by an external process
      // (fs-events are not fired across process boundaries on all platforms).
      usePolling: true,
      interval: 100,
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    sourcemap: false,
  },
})
