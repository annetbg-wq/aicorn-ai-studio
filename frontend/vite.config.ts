import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { generateManifest } from './src/scripts/generateManifest'

// Canonical dev server port — override via VITE_PORT env var if needed.
// strictPort: true means Vite will FAIL with a clear error if this port is occupied,
// preventing a second studio from silently starting on a different port.
const devPort = parseInt(process.env.VITE_PORT ?? '5183', 10);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'manifest',
      buildStart()     { generateManifest(); },
      handleHotUpdate({ file }) {
        if (file.includes('PROJECT_MANIFEST.json')) return;
        if (file.includes('/src/generated/')) return;
        if (file.includes('/src/')) generateManifest();
      },
    },
    {
      name: 'preview-bridge',
      configureServer(server) {
        const previewSrc = path.join(process.cwd(), '..', 'preview-app', 'src');

        // Clear all files in preview-app/src except main.tsx and index.css
        // After clearing, writes a placeholder App.tsx so Vite never breaks
        const PLACEHOLDER_APP = `export default function App() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <p className="text-gray-400 text-lg">Waiting for generation...</p>
    </div>
  );
}\n`;

        server.middlewares.use('/__clear_preview', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
          const keep = new Set(['main.tsx', 'index.css']);
          const keepDirs = new Set(['components', 'lib', 'themes']);
          try {
            const items = fs.readdirSync(previewSrc);
            for (const item of items) {
              if (keep.has(item) || keepDirs.has(item)) continue;
              const full = path.join(previewSrc, item);
              fs.rmSync(full, { recursive: true, force: true });
            }
            // Always ensure App.tsx exists so Vite never breaks
            fs.writeFileSync(path.join(previewSrc, 'App.tsx'), PLACEHOLDER_APP, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(e) }));
          }
        });

        // List files in a preview-app/src/ subdirectory
        server.middlewares.use('/__list_preview', (req, res) => {
          const url = new URL(req.url!, 'http://localhost');
          const dirPath = url.searchParams.get('path') || '';
          const fullPath = path.join(previewSrc, dirPath);
          try {
            const items = fs.readdirSync(fullPath, { withFileTypes: true });
            const entries = items.map(i => ({ name: i.name, isDirectory: i.isDirectory() }));
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, entries }));
          } catch {
            res.statusCode = 404;
            res.end(JSON.stringify({ ok: false }));
          }
        });

        // Read a single file from preview-app/src/
        server.middlewares.use('/__read_preview', (req, res) => {
          const url = new URL(req.url!, 'http://localhost');
          const filePath = url.searchParams.get('path') || '';
          const fullPath = path.join(previewSrc, filePath);
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, content }));
          } catch {
            res.statusCode = 404;
            res.end(JSON.stringify({ ok: false }));
          }
        });

        // Deploy preview-app to Vercel via CLI
        server.middlewares.use('/__deploy_preview', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
          const previewRoot = path.join(process.cwd(), '..', 'preview-app');
          try {
            execSync('npm run build', { cwd: previewRoot, stdio: 'pipe', timeout: 60_000 });
            const output = execSync(
              'vercel deploy dist --yes --prod 2>&1',
              { cwd: previewRoot, stdio: 'pipe', encoding: 'utf-8', timeout: 120_000 }
            );
            const urlMatch = output.match(/https:\/\/[^\s]+\.vercel\.app/);
            const url = urlMatch ? urlMatch[0] : output.trim().split('\n').pop();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, url }));
          } catch (e: any) {
            const msg = e?.stdout || e?.stderr || String(e);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: msg }));
          }
        });

        // Read ALL user-generated files from preview-app/src/ in one call
        server.middlewares.use('/__read_all_preview', (_req, res) => {
          try {
            const files: Record<string, string> = {};
            const skipDirs = new Set(['components', 'lib', 'themes', 'node_modules']);
            const skipFiles = new Set(['main.tsx']);

            function readDir(dir: string, prefix: string) {
              const items = fs.readdirSync(dir, { withFileTypes: true });
              for (const item of items) {
                if (item.isDirectory()) {
                  if (skipDirs.has(item.name)) continue;
                  readDir(path.join(dir, item.name), prefix ? `${prefix}/${item.name}` : item.name);
                } else if (item.name.match(/\.(tsx?|css|json)$/) && !skipFiles.has(item.name)) {
                  const filePath = prefix ? `${prefix}/${item.name}` : item.name;
                  const content = fs.readFileSync(path.join(dir, item.name), 'utf-8');
                  files[filePath] = content;
                }
              }
            }

            readDir(previewSrc, '');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, files }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });

        // Health check — verifies preview-app/src/ is readable and writable
        server.middlewares.use('/__health_preview', (_req, res) => {
          try {
            fs.accessSync(previewSrc, fs.constants.R_OK | fs.constants.W_OK);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 503;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });

        // Write a file to preview-app/src/
        server.middlewares.use('/__write_preview', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk; });
          req.on('end', () => {
            try {
              const { path: filePath, content } = JSON.parse(body);
              const fullPath = path.join(previewSrc, filePath);
              fs.mkdirSync(path.dirname(fullPath), { recursive: true });
              fs.writeFileSync(fullPath, content, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(e) }));
            }
          });
        });
      },
    },
  ],
  server: {
    port: devPort,
    strictPort: true,   // fail hard if port is taken — no silent fallback
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@radix-ui')) {
            return 'vendor-radix';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-lucide';
          }
        },
      },
    },
  },
})
