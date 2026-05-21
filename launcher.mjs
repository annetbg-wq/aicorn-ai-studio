/**
 * launcher.mjs — запускает все три сервера и следит за ними.
 * При падении любого — автоматически перезапускает через 2 секунды.
 * Пишет статус в launcher-status.json (читается backend'ом через /api/launcher-status).
 *
 * Запуск: node launcher.mjs   или   npm start
 */

import { spawn } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATUS_FILE = join(__dirname, 'launcher-status.json');
const isWin = process.platform === 'win32';

// ── Server definitions ────────────────────────────────────────────────────────
// NOTE: preview-workspace dev server (:3100) is intentionally excluded.
// The live preview path uses backend static builds served by Express :3000;
// the Vite HMR watcher on :3100 only caused write-lock contention on Windows.
const SERVERS = {
  frontend: {
    cmd:    isWin ? 'npm.cmd' : 'npm',
    args:   ['run', 'dev', '--prefix', 'frontend'],
    port:   5183,
    label:  'Frontend (Vite :5183)',
  },
  backend: {
    cmd:    isWin ? 'npx.cmd' : 'npx',
    args:   ['tsx', 'backend/auth-token.ts'],
    port:   3000,
    label:  'Backend (:3000)',
  },
};

// Runtime state per server
const state = {};
for (const name of Object.keys(SERVERS)) {
  state[name] = { status: 'stopped', pid: null, restarts: 0, startedAt: null };
}

// ── Status file ───────────────────────────────────────────────────────────────
function writeStatus() {
  const out = { updatedAt: new Date().toISOString() };
  for (const [name, srv] of Object.entries(SERVERS)) {
    out[name] = {
      port:      srv.port,
      label:     srv.label,
      status:    state[name].status,
      pid:       state[name].pid,
      restarts:  state[name].restarts,
      startedAt: state[name].startedAt,
    };
  }
  try {
    writeFileSync(STATUS_FILE, JSON.stringify(out, null, 2), 'utf8');
  } catch { /* ignore FS errors */ }
}

// ── Start / restart logic ─────────────────────────────────────────────────────
function startServer(name) {
  const srv    = SERVERS[name];
  const st     = state[name];

  if (st.status === 'running' || st.status === 'starting') return;

  console.log(`[launcher] Starting ${srv.label}…`);
  st.status    = 'starting';
  st.pid       = null;
  writeStatus();

  const child = spawn(srv.cmd, srv.args, {
    cwd:   __dirname,
    stdio: 'inherit',
    shell: isWin,
  });

  child.on('spawn', () => {
    st.status    = 'running';
    st.pid       = child.pid ?? null;
    st.startedAt = new Date().toISOString();
    console.log(`[launcher] ${srv.label} running (pid ${child.pid})`);
    writeStatus();
  });

  child.on('error', (err) => {
    console.error(`[launcher] ${srv.label} error: ${err.message}`);
    st.status = 'error';
    st.pid    = null;
    st.restarts++;
    writeStatus();
    setTimeout(() => startServer(name), 2000);
  });

  child.on('exit', (code, signal) => {
    if (st.status === 'stopped') return; // intentional shutdown
    console.log(`[launcher] ${srv.label} exited (code=${code} signal=${signal}), restarting in 2 s…`);
    st.status = 'restarting';
    st.pid    = null;
    st.restarts++;
    writeStatus();
    setTimeout(() => startServer(name), 2000);
  });
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown() {
  console.log('\n[launcher] Shutting down all servers…');
  for (const [, st] of Object.entries(state)) {
    st.status = 'stopped';
  }
  writeStatus();
  process.exit(0);
}

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

// ── Boot all servers ──────────────────────────────────────────────────────────
console.log('[launcher] AIC-RG Studio — process manager starting');
console.log('[launcher] Press Ctrl+C to stop all servers\n');

for (const name of Object.keys(SERVERS)) {
  startServer(name);
}
