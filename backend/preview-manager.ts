/**
 * preview-manager.ts — Vite process orchestrator
 * 1 project = 1 Vite process, auto-restart on crash.
 *
 * Required deps (add to root package.json if absent):
 *   npm i get-port wait-on
 *   npm i -D @types/wait-on
 */

import { spawn, ChildProcess } from 'child_process';
import express from 'express';
import fs from 'fs';
import path from 'path';
import getPort from 'get-port';
// @ts-ignore — wait-on ships CJS; types may need @types/wait-on
import waitOn from 'wait-on';

// ── types ─────────────────────────────────────────────────────────────────────

export interface ProjectFile {
  /** Relative path inside src/, e.g. "App.tsx" or "components/Button.tsx" */
  path: string;
  content: string;
}

type InstanceStatus = 'starting' | 'running' | 'stopped';

interface PreviewInstance {
  projectId: string;
  port: number;
  status: InstanceStatus;
  process: ChildProcess | null;
  /** Resolves with the port once the dev server is accepting connections. */
  readyPromise: Promise<number> | null;
}

// ── constants ─────────────────────────────────────────────────────────────────

const TEMPLATE_DIR = path.resolve(__dirname, '..', 'preview-workspace');
const PREVIEW_WORKSPACE = path.resolve(__dirname, '..', 'preview-workspace');
const PREVIEWS_DIR = path.resolve(__dirname, '..', 'previews');
const STARTUP_TIMEOUT_MS = 20_000;
const RESTART_DELAY_MS   = 1_000;

// ── state ─────────────────────────────────────────────────────────────────────

const instances = new Map<string, PreviewInstance>();

/**
 * Mount static route for immutable build snapshots.
 * Expected URL: /preview/:buildId
 */
export function registerPreviewBuildRoute(app: express.Express): void {
  app.use('/preview/:buildId', (req, res, next) => {
    const buildPath = path.join(PREVIEW_WORKSPACE, req.params.buildId);
    if (!fs.existsSync(buildPath)) return res.status(404).send('Build not found');
    return express.static(buildPath)(req, res, (err) => {
      if (err) return next(err);
      // fallback для SPA роутинга
      return res.sendFile(path.join(buildPath, 'index.html'));
    });
  });
}

// ── internal helpers ──────────────────────────────────────────────────────────

function projectDir(projectId: string): string {
  return path.join(PREVIEWS_DIR, projectId);
}

function copyTemplate(projectId: string): void {
  const dest = projectDir(projectId);
  if (!fs.existsSync(dest)) {
    fs.cpSync(TEMPLATE_DIR, dest, { recursive: true });
  }
}

async function waitForServer(port: number): Promise<void> {
  await waitOn({
    resources: [`http-get://localhost:${port}`],
    timeout: STARTUP_TIMEOUT_MS,
    interval: 250,
    simultaneous: 1,
    // suppress wait-on's own console output
    log: false,
    verbose: false,
  });
}

/**
 * Spawns the Vite dev process for an existing instance.
 * Re-entrant: safe to call again after a crash (restarts in-place).
 */
function spawnProcess(inst: PreviewInstance): void {
  const cwd  = projectDir(inst.projectId);
  const args = ['vite', '--port', String(inst.port), '--strictPort', '--host'];

  const child = spawn('npx', args, {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  inst.process = child;

  child.stdout?.on('data', (chunk: Buffer) =>
    process.stdout.write(`[preview:${inst.projectId}] ${chunk}`)
  );
  child.stderr?.on('data', (chunk: Buffer) =>
    process.stderr.write(`[preview:${inst.projectId}] ${chunk}`)
  );

  child.on('exit', (code, signal) => {
    if (inst.status === 'stopped') return; // manual stop — do not restart

    console.error(
      `[preview-manager] Process for "${inst.projectId}" exited ` +
      `(code=${code}, signal=${signal}). Restarting in ${RESTART_DELAY_MS}ms…`
    );
    inst.process = null;
    inst.status  = 'starting';

    // Rebuild the readyPromise so callers who await startPreview() again
    // will correctly wait for the restarted server.
    inst.readyPromise = new Promise<number>((resolve, reject) => {
      setTimeout(async () => {
        try {
          spawnProcess(inst);
          await waitForServer(inst.port);
          inst.status = 'running';
          resolve(inst.port);
        } catch (err) {
          console.error(`[preview-manager] Restart failed for "${inst.projectId}":`, err);
          reject(err);
        }
      }, RESTART_DELAY_MS);
    });
  });
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Start (or return the already-running) Vite dev server for a project.
 * Returns the port the server is listening on.
 */
export async function startPreview(projectId: string): Promise<number> {
  const existing = instances.get(projectId);

  if (existing) {
    if (existing.status === 'running') return existing.port;
    if (existing.status === 'starting' && existing.readyPromise) {
      return existing.readyPromise;
    }
  }

  const port = await getPort({ port: getPort.makeRange(4200, 4999) });

  const inst: PreviewInstance = {
    projectId,
    port,
    status: 'starting',
    process: null,
    readyPromise: null,
  };

  instances.set(projectId, inst);

  inst.readyPromise = (async (): Promise<number> => {
    copyTemplate(projectId);
    spawnProcess(inst);
    await waitForServer(port);
    inst.status = 'running';
    return port;
  })();

  return inst.readyPromise;
}

/**
 * Write files into the running project's src/ directory.
 * Ensures the server is started first.
 */
export async function pushFiles(projectId: string, files: ProjectFile[]): Promise<void> {
  await startPreview(projectId);

  const srcDir = path.join(projectDir(projectId), 'src');

  for (const file of files) {
    const dest = path.join(srcDir, file.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (dest.endsWith('App.tsx') && file.content.trim().startsWith('{')) {
      throw new Error('FATAL: POISON_BLOCKED. Attempted to write JSON artifact to App.tsx');
    }
    fs.writeFileSync(dest, file.content, 'utf-8');
  }
}

/**
 * Return the port for a running project, or null if unknown / not started.
 */
export function getPreviewPort(projectId: string): number | null {
  const inst = instances.get(projectId);
  return inst && inst.status !== 'stopped' ? inst.port : null;
}

/**
 * Kill the Vite process for a project and remove it from the instance map.
 */
export function stopPreview(projectId: string): void {
  const inst = instances.get(projectId);
  if (!inst) return;

  inst.status = 'stopped'; // must be set BEFORE kill() so exit handler skips restart
  inst.process?.kill('SIGTERM');
  inst.process = null;
  instances.delete(projectId);

  console.log(`[preview-manager] Stopped preview for "${projectId}".`);
}
