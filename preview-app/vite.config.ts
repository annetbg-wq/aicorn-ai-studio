import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs/promises'

export default defineConfig({
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

        server.middlewares.use('/__clear_preview', async (req, res) => {
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

          try {
            const srcDir = path.resolve(__dirname, 'src');
            const EMPTY_COMPONENT = `export default function Empty() { return null; }\n`;
            // Files/directories that survive every clear. `components` and `lib`
            // hold shadcn primitives + the `cn` helper — generated user code
            // depends on them, so they MUST NOT be deleted across cycles.
            const preserve = new Set([
              'main.tsx',
              'index.css',
              '__build_id.ts',
              'components',
              'lib',
              'hooks',
              'route-manifest.json',
            ]);
            const entries = await fs.readdir(srcDir, { withFileTypes: true });

            for (const entry of entries) {
              if (preserve.has(entry.name)) continue;
              const fullPath = path.join(srcDir, entry.name);
              if (entry.isDirectory()) {
                await fs.rm(fullPath, { recursive: true, force: true });
              } else {
                if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
                  await fs.writeFile(fullPath, EMPTY_COMPONENT, 'utf8');
                } else {
                  await fs.unlink(fullPath);
                }
              }
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ cleared: true }));
            console.log('[preview-server] Preview src cleared');
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: String(err) }));
          }
        });

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
