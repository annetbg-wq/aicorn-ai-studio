/**
 * launcher.mjs — запускает все три сервера и следит за ними.
 * При падении любого — автоматически перезапускает через 2 секунды.
 * Пишет статус в launcher-status.json (читается backend'ом через /api/launcher-status).
 *
 * Запуск: node launcher.mjs   или   npm start
 */

import { spawn, execFileSync } from 'child_process';
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
    probeUrl: 'http://localhost:5183/',
  },
  backend: {
    cmd:    isWin ? 'npx.cmd' : 'npx',
    args:   ['tsx', 'backend/auth-token.ts'],
    port:   3000,
    label:  'Backend (:3000)',
    probeUrl: 'http://localhost:3000/api/health',
  },
};

// Runtime state per server
const state = {};
for (const name of Object.keys(SERVERS)) {
  state[name] = { status: 'stopped', pid: null, restarts: 0, startedAt: null };
}

const MAX_RESTARTS = 5;

function restartDelayMs(restarts) {
  return Math.min(2000 * (restarts + 1), 10000);
}

function safeExecFile(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

function describeWindowsPid(pid) {
  if (!pid || Number.isNaN(pid)) return null;

  const tasklistOutput = safeExecFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']).trim();
  if (!tasklistOutput || tasklistOutput.startsWith('INFO:')) {
    return { pid, processName: null };
  }

  const processName = tasklistOutput.replace(/^"/, '').split('",')[0]?.replace(/^"|"$/g, '') ?? null;
  return { pid, processName };
}

function inspectPort(port) {
  if (process.platform === 'win32') {
    const netstatOutput = safeExecFile('netstat', ['-ano', '-p', 'tcp']);
    const lines = netstatOutput.split(/\r?\n/);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5 || parts[0] !== 'TCP' || parts[3] !== 'LISTENING') continue;
      if (!new RegExp(`:${port}$`).test(parts[1])) continue;
      const pid = Number(parts[4]);
      return { occupied: true, ...(describeWindowsPid(pid) ?? {}) };
    }
    return { occupied: false, pid: null, processName: null };
  }

  const lsofOutput = safeExecFile('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).trim();
  if (!lsofOutput) return { occupied: false, pid: null, processName: null };

  const pid = Number(lsofOutput.split(/\r?\n/, 1)[0]);
  const psOutput = safeExecFile('ps', ['-p', String(pid), '-o', 'comm=']).trim();
  return { occupied: true, pid, processName: psOutput || null };
}

function formatOccupant(inspection) {
  if (!inspection.occupied) return 'unknown process';
  if (inspection.processName && inspection.pid) return `PID ${inspection.pid} (${inspection.processName})`;
  if (inspection.pid) return `PID ${inspection.pid}`;
  return 'unknown process';
}

async function probeExpectedService(url) {
  if (!url) return false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { Accept: 'text/html,application/json;q=0.9,*/*;q=0.1' },
    });
    return response.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
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
async function startServer(name) {
  const srv    = SERVERS[name];
  const st     = state[name];

  if (st.status === 'running' || st.status === 'starting') return;

  if (st.restarts >= MAX_RESTARTS) {
    console.error(`[launcher] ${srv.label} exceeded max restarts (${MAX_RESTARTS}). Not restarting. Fix the issue and restart the launcher.`);
    st.status = 'error';
    writeStatus();
    return;
  }

  const expectedServiceRunning = await probeExpectedService(srv.probeUrl);
  if (expectedServiceRunning) {
    const inspection = inspectPort(srv.port);
    st.pid = inspection.pid ?? null;
    st.startedAt = st.startedAt ?? new Date().toISOString();

    st.status = 'running';
    console.log(`[launcher] ${srv.label} — already responding on ${srv.probeUrl}; skipping duplicate start${inspection.occupied ? ` (${formatOccupant(inspection)})` : ''}.`);
    writeStatus();
    return;
  }

  const inspection = inspectPort(srv.port);
  if (inspection.occupied) {
    st.pid = inspection.pid ?? null;
    st.startedAt = st.startedAt ?? new Date().toISOString();
    st.status = 'error';
    console.error(`[launcher] ${srv.label} — port ${srv.port} is occupied by ${formatOccupant(inspection)}. Not restarting.`);
    writeStatus();
    return;
  }

  _spawnServer(name);
}

function _spawnServer(name) {
  const srv    = SERVERS[name];
  const st     = state[name];

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
    setTimeout(() => { void startServer(name); }, restartDelayMs(st.restarts));
  });

  child.on('exit', (code, signal) => {
    if (st.status === 'stopped') return; // intentional shutdown
    const delayMs = restartDelayMs(st.restarts);
    console.log(`[launcher] ${srv.label} exited (code=${code} signal=${signal}), restarting in ${Math.round(delayMs / 1000)} s…`);
    st.status = 'restarting';
    st.pid    = null;
    st.restarts++;
    writeStatus();
    setTimeout(() => { void startServer(name); }, delayMs);
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
  void startServer(name);
}
