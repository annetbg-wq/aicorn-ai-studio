/**
 * launcher.mjs — starts backend then frontend, with backend health supervision.
 *
 * Boot order (sequential):
 *   1. Backend supervisor: check port → kill stale if trusted → spawn → /api/health gate
 *   2. Only after backend health passes: start frontend (Vite :5183)
 *
 * Frontend readiness implies backend readiness because frontend is never started
 * until backend health passes.  Playwright webServer can safely probe :5183.
 *
 * Environment:
 *   BACKEND_HEALTH_TIMEOUT_MS  — health-poll deadline in ms (default 60 000)
 *
 * :3100 preview-workspace dev server is intentionally excluded.
 */

import { spawn, execFileSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATUS_FILE      = join(__dirname, 'launcher-status.json');
const BACKEND_LOCK_FILE = join(__dirname, '.launcher-backend.lock');
const isWin = process.platform === 'win32';

const BACKEND_HEALTH_TIMEOUT_MS =
  Number(process.env.BACKEND_HEALTH_TIMEOUT_MS) > 0
    ? Number(process.env.BACKEND_HEALTH_TIMEOUT_MS)
    : 60_000;

/** Lines of stdout / stderr printed in failure diagnostics. */
const TAIL_LINES = 80;

/** Max consecutive restarts before a server is abandoned. */
const MAX_RESTARTS = 5;

// ── Server definitions ────────────────────────────────────────────────────────
// :3100 (preview-workspace dev) is intentionally excluded.
const SERVERS = {
  backend: {
    cmd:     isWin ? 'npx.cmd' : 'npx',
    args:    ['tsx', 'backend/auth-token.ts'],
    port:    3000,
    label:   'Backend (:3000)',
    probeUrl: 'http://127.0.0.1:3000/api/health',
    healthCheckTimeoutMs: BACKEND_HEALTH_TIMEOUT_MS,
  },
  frontend: {
    cmd:     isWin ? 'npm.cmd' : 'npm',
    args:    ['run', 'dev', '--prefix', 'frontend'],
    port:    5183,
    label:   'Frontend (Vite :5183)',
    // Vite binds to `localhost` (resolves to ::1 on Windows), NOT 127.0.0.1 only.
    // Probing 127.0.0.1 missed the live server, so the launcher kept starting a
    // second frontend → EADDRINUSE. `localhost` matches wherever Vite actually listens.
    probeUrl: 'http://localhost:5183/',
    healthCheckTimeoutMs: 0, // no health gate — Playwright probes :5183 directly
  },
};

// ── Runtime state ─────────────────────────────────────────────────────────────
const state = {};
for (const name of Object.keys(SERVERS)) {
  state[name] = { status: 'stopped', pid: null, restarts: 0, startedAt: null };
}

/** Accumulated stdout / stderr buffers per server, reset on each spawn cycle. */
const capturedOutput = { backend: { stdout: [], stderr: [] }, frontend: { stdout: [], stderr: [] } };

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function restartDelayMs(restarts) {
  return Math.min(2000 * (restarts + 1), 10_000);
}

/**
 * Run a subprocess, return stdout as a string.
 * Always silent: failures return ''.
 */
function safeExecFile(command, args, { encoding = 'utf8', timeoutMs = 4000 } = {}) {
  try {
    return execFileSync(command, args, {
      encoding,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return encoding === 'buffer' ? Buffer.alloc(0) : '';
  }
}

// ── Port inspection ───────────────────────────────────────────────────────────
function describeWindowsPid(pid) {
  if (!pid || Number.isNaN(pid)) return null;
  const out = safeExecFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']).trim();
  if (!out || out.startsWith('INFO:')) return { pid, processName: null };
  const processName = out.replace(/^"/, '').split('",')[0]?.replace(/^"|"$/g, '') ?? null;
  return { pid, processName };
}

function inspectPort(port) {
  if (isWin) {
    const lines = safeExecFile('netstat', ['-ano', '-p', 'tcp']).split(/\r?\n/);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5 || parts[0] !== 'TCP' || parts[3] !== 'LISTENING') continue;
      if (!new RegExp(`:${port}$`).test(parts[1])) continue;
      const pid = Number(parts[4]);
      return { occupied: true, ...(describeWindowsPid(pid) ?? {}) };
    }
    return { occupied: false, pid: null, processName: null };
  }
  const out = safeExecFile('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).trim();
  if (!out) return { occupied: false, pid: null, processName: null };
  const pid = Number(out.split(/\r?\n/, 1)[0]);
  const comm = safeExecFile('ps', ['-p', String(pid), '-o', 'comm=']).trim();
  return { occupied: true, pid, processName: comm || null };
}

function formatOccupant(info) {
  if (!info.occupied) return 'unknown process';
  if (info.processName && info.pid) return `PID ${info.pid} (${info.processName})`;
  if (info.pid) return `PID ${info.pid}`;
  return 'unknown process';
}

// ── Process-tree introspection ────────────────────────────────────────────────

/**
 * Return the command-line string of a process by PID.
 * On Windows: tries wmic (fast, UTF-16 LE output) then PowerShell CIM.
 * On POSIX:   uses ps -o args=.
 * Returns '' on any failure.
 */
function getCommandLine(pid) {
  if (!pid || Number.isNaN(pid)) return '';
  if (isWin) {
    // wmic outputs UTF-16 LE; read raw buffer and decode
    const buf = safeExecFile(
      'wmic',
      ['process', 'where', `ProcessId=${pid}`, 'get', 'CommandLine', '/value'],
      { encoding: 'buffer' },
    );
    if (buf.length > 0) {
      const text = buf.toString('utf16le');
      const m = text.match(/CommandLine=(.*)/);
      if (m) return m[1].trim().replace(/[\r\n]+$/, '');
    }
    // Fallback: PowerShell CIM (slower but works when wmic is deprecated/unavailable)
    const ps = safeExecFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command',
        `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`],
      { timeoutMs: 6000 },
    );
    return ps.trim();
  }
  return safeExecFile('ps', ['-p', String(pid), '-o', 'args=']).trim();
}

/**
 * Return the parent PID of a process.
 * Returns null on failure or when pid <= 1.
 */
function getParentPid(pid) {
  if (!pid || Number.isNaN(pid) || pid <= 1) return null;
  if (isWin) {
    const buf = safeExecFile(
      'wmic',
      ['process', 'where', `ProcessId=${pid}`, 'get', 'ParentProcessId', '/value'],
      { encoding: 'buffer' },
    );
    if (buf.length > 0) {
      const text = buf.toString('utf16le');
      const m = text.match(/ParentProcessId=(\d+)/);
      if (m) return Number(m[1]) || null;
    }
    const ps = safeExecFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command',
        `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').ParentProcessId`],
      { timeoutMs: 6000 },
    );
    return Number(ps.trim()) || null;
  }
  const out = safeExecFile('ps', ['-p', String(pid), '-o', 'ppid=']).trim();
  return Number(out) || null;
}

/**
 * Return true if lockedPid equals occupantPid or appears somewhere in
 * occupantPid's ancestor chain (up to maxDepth steps).
 */
function isLockedPidInChain(lockedPid, occupantPid, maxDepth = 6) {
  if (!lockedPid || !occupantPid) return false;
  if (lockedPid === occupantPid) return true;
  let current = occupantPid;
  for (let i = 0; i < maxDepth; i++) {
    const parent = getParentPid(current);
    if (!parent || parent === current) return false;
    if (parent === lockedPid) return true;
    current = parent;
  }
  return false;
}

/** Patterns that unambiguously identify our backend process. */
const TRUSTED_BACKEND_PATTERNS = [
  /backend[/\\]auth-token\.ts/i,
  /tsx\s+backend/i,
];

function isTrustedBackendCommandLine(cmdLine) {
  if (!cmdLine) return false;
  return TRUSTED_BACKEND_PATTERNS.some(p => p.test(cmdLine));
}

/**
 * Check the command lines of occupantPid AND lockedPid (and a few ancestors)
 * to see if any identifies as our backend.
 */
function anyCommandLineMatchesBackend(occupantPid, lockedPid) {
  const pidsToCheck = new Set([occupantPid, lockedPid].filter(Boolean));
  // Walk up from occupant a few steps
  let cur = occupantPid;
  for (let i = 0; i < 4 && cur; i++) {
    pidsToCheck.add(cur);
    cur = getParentPid(cur) ?? 0;
  }
  for (const p of pidsToCheck) {
    if (isTrustedBackendCommandLine(getCommandLine(p))) return true;
  }
  return false;
}

// ── Process kill ──────────────────────────────────────────────────────────────
function killByPid(pid) {
  if (!pid || Number.isNaN(pid)) return;
  try {
    if (isWin) {
      // /T kills the process tree so child node processes are also terminated
      execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)],
        { stdio: 'ignore', timeout: 4000 });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch { /* already dead */ }
}

/** Poll until port is free, or timeout. */
async function waitForPortFree(port, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!inspectPort(port).occupied) return true;
    await sleep(200);
  }
  return false;
}

// ── Backend lock file ─────────────────────────────────────────────────────────
function readBackendLock() {
  try { return JSON.parse(readFileSync(BACKEND_LOCK_FILE, 'utf8')); } catch { return null; }
}
function writeBackendLock(pid) {
  try {
    writeFileSync(BACKEND_LOCK_FILE,
      JSON.stringify({ pid, launcherPid: process.pid, startedAt: new Date().toISOString() }),
      'utf8');
  } catch { /* non-fatal */ }
}
function clearBackendLock() {
  try { unlinkSync(BACKEND_LOCK_FILE); } catch { /* already gone */ }
}

// ── Health polling ────────────────────────────────────────────────────────────
/**
 * Poll url every 500 ms until it returns a non-5xx status, or deadline.
 * Accepts an AbortSignal so callers can cancel early (e.g. when the process exits).
 */
async function pollHealth(url, timeoutMs, signal = null) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) return false;
    const fetchAbort = new AbortController();
    const timer = setTimeout(() => fetchAbort.abort(), 1500);
    try {
      const res = await fetch(url, { signal: fetchAbort.signal, redirect: 'manual' });
      clearTimeout(timer);
      if (res.status > 0 && res.status < 500) return true;
    } catch {
      clearTimeout(timer);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(500, remaining));
  }
  return false;
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
  try { writeFileSync(STATUS_FILE, JSON.stringify(out, null, 2), 'utf8'); } catch {}
}

// ── Diagnostics ───────────────────────────────────────────────────────────────
function printDiagnostics(name) {
  const cap = capturedOutput[name];
  if (!cap) return;
  for (const [stream, label] of [['stdout', 'stdout'], ['stderr', 'stderr']]) {
    const text = Buffer.concat(cap[stream]).toString('utf8');
    const lines = text.split('\n').filter(l => l.length > 0);
    const tail = lines.slice(-TAIL_LINES);
    if (tail.length === 0) continue;
    console.error(
      `\n[launcher] ${SERVERS[name].label} — ${label} (last ${tail.length} lines):\n` +
      tail.join('\n') + '\n',
    );
  }
}

// ── Core: spawn + tee + health gate ──────────────────────────────────────────
/**
 * Spawn the server process, tee its stdout+stderr, then wait for health.
 *
 * @param {string} name
 * @param {{ fatalOnFail?: boolean }} opts
 *   fatalOnFail — if true and health gate fails, throws instead of logging
 */
async function spawnServer(name, { fatalOnFail = false } = {}) {
  const srv = SERVERS[name];
  const st  = state[name];
  const hasHealthGate = srv.healthCheckTimeoutMs > 0;

  console.log(`[launcher] Starting ${srv.label}…`);
  st.status = 'starting';
  st.pid    = null;
  writeStatus();

  // Reset output buffers for this spawn cycle
  capturedOutput[name] = { stdout: [], stderr: [] };

  // Tee both streams: pipe to capture + write through to launcher's own streams
  const child = spawn(srv.cmd, srv.args, {
    cwd:   __dirname,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: isWin,
  });

  child.stdout?.on('data', (chunk) => {
    process.stdout.write(chunk);
    capturedOutput[name].stdout.push(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk);
    capturedOutput[name].stderr.push(chunk);
  });

  // Wait for the OS to confirm the process started
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });

  st.pid       = child.pid ?? null;
  st.startedAt = new Date().toISOString();
  console.log(`[launcher] ${srv.label} process started (pid ${child.pid})`);
  writeStatus();

  if (name === 'backend') writeBackendLock(child.pid);

  // AbortController lets the health gate bail out early if the process dies
  const healthAbort = new AbortController();

  // Wire exit / error handlers BEFORE the health gate so crashes during
  // polling are handled and don't leave the health gate waiting 60 s.
  child.on('error', (err) => {
    healthAbort.abort();
    if (name === 'backend') clearBackendLock();
    console.error(`[launcher] ${srv.label} process error: ${err.message}`);
    st.status = 'error'; st.pid = null; st.restarts++;
    writeStatus();
    setTimeout(() => { void startServer(name); }, restartDelayMs(st.restarts));
  });

  child.on('exit', (code, signal) => {
    healthAbort.abort();
    if (st.status === 'stopped') return; // intentional shutdown
    if (name === 'backend') clearBackendLock();
    const delay = restartDelayMs(st.restarts);
    console.log(
      `[launcher] ${srv.label} exited (code=${code} signal=${signal}), ` +
      `restarting in ${Math.round(delay / 1000)} s…`,
    );
    st.status = 'restarting'; st.pid = null; st.restarts++;
    writeStatus();
    setTimeout(() => { void startServer(name); }, delay);
  });

  // ── Health gate ────────────────────────────────────────────────────────────
  if (hasHealthGate) {
    console.log(
      `[launcher] Waiting for ${srv.probeUrl}` +
      ` (timeout: ${srv.healthCheckTimeoutMs / 1000} s)…`,
    );
    const healthy = await pollHealth(srv.probeUrl, srv.healthCheckTimeoutMs, healthAbort.signal);
    if (!healthy) {
      printDiagnostics(name);
      st.status = 'error';
      writeStatus();
      const msg =
        `${srv.label} — health gate failed: ${srv.probeUrl} ` +
        `did not respond in ${srv.healthCheckTimeoutMs / 1000} s`;
      if (fatalOnFail) throw new Error(msg);
      console.error(`[launcher] ${msg}`);
      return;
    }
    console.log(`[launcher] ${srv.label} — health OK ✓`);
  }

  st.status = 'running';
  writeStatus();
}

// ── Start server (with port checks and stale-kill) ────────────────────────────
/**
 * @param {string} name
 * @param {{ fatalOnFail?: boolean }} opts
 */
async function startServer(name, { fatalOnFail = false } = {}) {
  const srv = SERVERS[name];
  const st  = state[name];

  if (st.status === 'running' || st.status === 'starting') return;

  if (st.restarts >= MAX_RESTARTS) {
    console.error(
      `[launcher] ${srv.label} exceeded max restarts (${MAX_RESTARTS}). ` +
      `Giving up.`,
    );
    printDiagnostics(name);
    st.status = 'error';
    writeStatus();
    if (name === 'backend') process.exit(1);
    return;
  }

  // ── Fast path: service already healthy ────────────────────────────────────
  if (await pollHealth(srv.probeUrl, 2000)) {
    const info = inspectPort(srv.port);
    st.pid       = info.pid ?? null;
    st.startedAt = st.startedAt ?? new Date().toISOString();
    st.status    = 'running';
    console.log(
      `[launcher] ${srv.label} — already responding on ${srv.probeUrl}; ` +
      `skipping duplicate start${info.occupied ? ` (${formatOccupant(info)})` : ''}.`,
    );
    writeStatus();
    return;
  }

  // ── Port occupied but service not healthy ─────────────────────────────────
  const info = inspectPort(srv.port);
  if (info.occupied) {
    if (name === 'backend') {
      const lock = readBackendLock();
      const occupantPid = info.pid;

      // Trust requires BOTH: PID chain match AND command-line fingerprint
      const pidChainTrusted = lock && isLockedPidInChain(lock.pid, occupantPid);
      const cmdLineTrusted  = anyCommandLineMatchesBackend(occupantPid, lock?.pid);

      if (pidChainTrusted && cmdLineTrusted) {
        console.log(
          `[launcher] ${srv.label} — stale backend detected ` +
          `(${formatOccupant(info)}); killing.`,
        );
        killByPid(occupantPid);
        // Also kill the shell wrapper if it differs (Windows cmd.exe parent)
        if (lock.pid && lock.pid !== occupantPid) killByPid(lock.pid);
        clearBackendLock();
        const freed = await waitForPortFree(srv.port, 3000);
        if (!freed) {
          const msg =
            `${srv.label} — port ${srv.port} still occupied after kill. ` +
            `Manual intervention required.`;
          if (fatalOnFail) throw new Error(msg);
          console.error(`[launcher] ${msg}`);
          st.status = 'error'; writeStatus(); return;
        }
      } else {
        // Not trusted: fail fast with full diagnostics
        const cmdLine = getCommandLine(occupantPid) || '(unavailable)';
        const msg =
          `${srv.label} — port ${srv.port} is occupied by an unrecognized process.\n` +
          `  PID: ${occupantPid}\n` +
          `  commandLine: ${cmdLine}\n` +
          `  lock: ${lock ? JSON.stringify(lock) : 'none'}\n` +
          `  pidChainTrusted: ${pidChainTrusted}, cmdLineTrusted: ${cmdLineTrusted}\n` +
          `Stop the foreign process or choose a different port.`;
        if (fatalOnFail) throw new Error(msg);
        console.error(`[launcher] ${msg}`);
        st.status = 'error'; writeStatus(); return;
      }
    } else {
      // Frontend: never try to kill
      console.error(
        `[launcher] ${srv.label} — port ${srv.port} is occupied by ` +
        `${formatOccupant(info)}. Not starting.`,
      );
      st.status = 'error'; writeStatus(); return;
    }
  }

  await spawnServer(name, { fatalOnFail });
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown() {
  console.log('\n[launcher] Shutting down all servers…');
  for (const st of Object.values(state)) st.status = 'stopped';
  clearBackendLock();
  writeStatus();
  process.exit(0);
}

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

// ── Boot (sequential: backend first, frontend only after health passes) ───────
console.log('[launcher] AIC-RG Studio — process manager starting');
console.log(`[launcher] Backend health timeout: ${BACKEND_HEALTH_TIMEOUT_MS / 1000} s`);
console.log('[launcher] Press Ctrl+C to stop\n');

try {
  await startServer('backend', { fatalOnFail: true });
} catch (err) {
  console.error(`\n[launcher] FATAL: ${err.message}`);
  console.error('[launcher] Studio startup aborted. Fix the backend and retry.\n');
  process.exit(1);
}

// Backend is healthy; start frontend (fire-and-forget — Playwright probes :5183)
void startServer('frontend');
