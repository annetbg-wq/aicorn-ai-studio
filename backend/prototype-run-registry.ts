import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type PrototypeApiMode = 'mock' | 'staging';
export type PrototypeRunKind = 'reference' | 'generation' | 'fixture';
export type PrototypeRunRetention = 'rolling' | 'pinned';
export type PrototypeRunStatus =
  | 'compiling'
  | 'ready'
  | 'qa_running'
  | 'qa_failed'
  | 'failed';

export interface PrototypeRunQaSummary {
  passed: boolean;
  consoleErrorCount: number;
  pageErrorCount: number;
  brokenLinkCount: number;
  deadButtonCount: number;
  failedFlowCount: number;
}

export interface PrototypeRunRecord {
  schemaVersion: 1;
  runId: string;
  buildId: string;
  apiMode: PrototypeApiMode;
  skeletonId: string;
  kind: PrototypeRunKind;
  retention: PrototypeRunRetention;
  status: PrototypeRunStatus;
  previewPath: string;
  sessionFingerprint: string;
  createdAt: string;
  updatedAt: string;
  qaSummary?: PrototypeRunQaSummary;
}

interface RunRegistryState {
  schemaVersion: 1;
  runs: PrototypeRunRecord[];
}

interface PreviewSessionBindingRecord {
  sessionToken: string;
  updatedAt: string;
}

interface PreviewSessionBindingState {
  schemaVersion: 1;
  bindings: Record<string, PreviewSessionBindingRecord>;
}

export interface UpsertPrototypeRunInput {
  runId: string;
  buildId?: string;
  apiMode: PrototypeApiMode;
  skeletonId: string;
  kind?: PrototypeRunKind;
  retention?: PrototypeRunRetention;
  status: PrototypeRunStatus;
  sessionFingerprint: string;
  qaSummary?: PrototypeRunQaSummary;
}

export interface RestoreBindingsResult {
  restored: number;
  pruned: number;
}

export const DEFAULT_PROTOTYPE_RUN_REGISTRY_ROOT = path.resolve(
  process.cwd(),
  process.env.AIC_PROTOTYPE_RUN_REGISTRY_DIR || '.prototype-run-registry',
);
export const DEFAULT_MAX_ROLLING_RUNS = 10;
export const MAX_PINNED_RUNS = 10;

function registryFiles(root: string) {
  return {
    root,
    runs: path.join(root, 'runs.json'),
    bindings: path.join(root, 'preview-session-bindings.json'),
  };
}

function ensureRoot(root: string): void {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(root, 0o700); } catch { /* Windows / restricted FS */ }
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  const root = path.dirname(filePath);
  ensureRoot(root);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  try { fs.chmodSync(tempPath, 0o600); } catch { /* Windows / restricted FS */ }
  fs.renameSync(tempPath, filePath);
  try { fs.chmodSync(filePath, 0o600); } catch { /* Windows / restricted FS */ }
}

function readRunState(root: string): RunRegistryState {
  return readJson(registryFiles(root).runs, { schemaVersion: 1, runs: [] });
}

function writeRunState(root: string, state: RunRegistryState): void {
  writeJsonAtomic(registryFiles(root).runs, state);
}

function readBindingState(root: string): PreviewSessionBindingState {
  return readJson(registryFiles(root).bindings, { schemaVersion: 1, bindings: {} });
}

function writeBindingState(root: string, state: PreviewSessionBindingState): void {
  writeJsonAtomic(registryFiles(root).bindings, state);
}

function assertId(value: string, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || !/^[\w-]{8,}$/.test(normalized)) {
    throw new Error(`${label} must be a non-empty build-like id`);
  }
  return normalized;
}

function assertSessionToken(value: string): string {
  const token = typeof value === 'string' ? value.trim() : '';
  if (token.length < 16 || token.length > 200) {
    throw new Error('preview session token must be 16-200 characters');
  }
  return token;
}

function assertFingerprint(value: string): string {
  const fingerprint = typeof value === 'string' ? value.trim() : '';
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) {
    throw new Error('sessionFingerprint must be a SHA-256 hex digest');
  }
  return fingerprint.toLowerCase();
}

function assertApiMode(value: PrototypeApiMode): PrototypeApiMode {
  if (value !== 'mock' && value !== 'staging') {
    throw new Error('apiMode must be mock or staging');
  }
  return value;
}

function assertRetention(value: PrototypeRunRetention): PrototypeRunRetention {
  if (value !== 'rolling' && value !== 'pinned') {
    throw new Error('retention must be rolling or pinned');
  }
  return value;
}

export function fingerprintPreviewSession(sessionToken: string): string {
  return crypto.createHash('sha256').update(assertSessionToken(sessionToken)).digest('hex');
}

export function recordPreviewSessionBinding(
  buildId: string,
  sessionToken: string,
  root = DEFAULT_PROTOTYPE_RUN_REGISTRY_ROOT,
): void {
  const id = assertId(buildId, 'buildId');
  const token = assertSessionToken(sessionToken);
  const state = readBindingState(root);
  state.bindings[id] = { sessionToken: token, updatedAt: new Date().toISOString() };
  writeBindingState(root, state);
}

export function readStoredPreviewSessionToken(
  buildId: string,
  root = DEFAULT_PROTOTYPE_RUN_REGISTRY_ROOT,
): string | null {
  const id = assertId(buildId, 'buildId');
  return readBindingState(root).bindings[id]?.sessionToken ?? null;
}

export function pruneMissingPreviewSessionBindings(
  buildsRoot: string,
  root = DEFAULT_PROTOTYPE_RUN_REGISTRY_ROOT,
): number {
  if (!fs.existsSync(buildsRoot)) return 0;
  const state = readBindingState(root);
  let pruned = 0;
  for (const buildId of Object.keys(state.bindings)) {
    if (fs.existsSync(path.join(buildsRoot, buildId))) continue;
    delete state.bindings[buildId];
    pruned += 1;
  }
  if (pruned > 0) writeBindingState(root, state);
  return pruned;
}

export function restorePreviewSessionBindings(
  bind: (buildId: string, sessionToken: string) => unknown,
  buildsRoot: string,
  root = DEFAULT_PROTOTYPE_RUN_REGISTRY_ROOT,
): RestoreBindingsResult {
  const pruned = pruneMissingPreviewSessionBindings(buildsRoot, root);
  const state = readBindingState(root);
  let restored = 0;
  for (const [buildId, binding] of Object.entries(state.bindings)) {
    if (!fs.existsSync(path.join(buildsRoot, buildId))) continue;
    bind(buildId, binding.sessionToken);
    restored += 1;
  }
  return { restored, pruned };
}

export function listPrototypeRuns(
  root = DEFAULT_PROTOTYPE_RUN_REGISTRY_ROOT,
): PrototypeRunRecord[] {
  return [...readRunState(root).runs].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getPrototypeRun(
  runId: string,
  root = DEFAULT_PROTOTYPE_RUN_REGISTRY_ROOT,
): PrototypeRunRecord | null {
  const id = assertId(runId, 'runId');
  return readRunState(root).runs.find(run => run.runId === id) ?? null;
}

export function prunePrototypeRuns(
  maxRollingRuns = DEFAULT_MAX_ROLLING_RUNS,
  root = DEFAULT_PROTOTYPE_RUN_REGISTRY_ROOT,
): string[] {
  const state = readRunState(root);
  const pinned = state.runs.filter(run => run.retention === 'pinned');
  const rolling = state.runs
    .filter(run => run.retention === 'rolling')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const keepRolling = rolling.slice(0, Math.max(0, maxRollingRuns));
  const evicted = rolling.slice(Math.max(0, maxRollingRuns)).map(run => run.runId);
  if (evicted.length > 0) {
    writeRunState(root, { schemaVersion: 1, runs: [...pinned, ...keepRolling] });
  }
  return evicted;
}

export function upsertPrototypeRun(
  input: UpsertPrototypeRunInput,
  root = DEFAULT_PROTOTYPE_RUN_REGISTRY_ROOT,
  maxRollingRuns = DEFAULT_MAX_ROLLING_RUNS,
): PrototypeRunRecord {
  const runId = assertId(input.runId, 'runId');
  const buildId = assertId(input.buildId ?? input.runId, 'buildId');
  if (runId !== buildId) throw new Error('runId must equal buildId for prototype run registry records');
  const apiMode = assertApiMode(input.apiMode);
  const skeletonId = typeof input.skeletonId === 'string' ? input.skeletonId.trim() : '';
  if (!skeletonId) throw new Error('skeletonId is required');
  const retention = assertRetention(input.retention ?? 'rolling');
  const kind = input.kind ?? 'generation';
  if (!['reference', 'generation', 'fixture'].includes(kind)) throw new Error('invalid prototype run kind');

  const state = readRunState(root);
  const existing = state.runs.find(run => run.runId === runId);
  if (retention === 'pinned' && existing?.retention !== 'pinned') {
    const pinnedCount = state.runs.filter(run => run.retention === 'pinned').length;
    if (pinnedCount >= MAX_PINNED_RUNS) {
      throw new Error(`cannot pin more than ${MAX_PINNED_RUNS} prototype runs`);
    }
  }

  const now = new Date().toISOString();
  const record: PrototypeRunRecord = {
    schemaVersion: 1,
    runId,
    buildId,
    apiMode,
    skeletonId,
    kind,
    retention,
    status: input.status,
    previewPath: `/preview/${buildId}/`,
    sessionFingerprint: assertFingerprint(input.sessionFingerprint),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(input.qaSummary ? { qaSummary: input.qaSummary } : {}),
  };

  const nextRuns = state.runs.filter(run => run.runId !== runId);
  nextRuns.push(record);
  writeRunState(root, { schemaVersion: 1, runs: nextRuns });
  prunePrototypeRuns(maxRollingRuns, root);
  return getPrototypeRun(runId, root) ?? record;
}

export function setPrototypeRunRetention(
  runId: string,
  retention: PrototypeRunRetention,
  root = DEFAULT_PROTOTYPE_RUN_REGISTRY_ROOT,
): PrototypeRunRecord {
  const existing = getPrototypeRun(runId, root);
  if (!existing) throw new Error(`prototype run not found: ${runId}`);
  return upsertPrototypeRun({
    ...existing,
    retention: assertRetention(retention),
  }, root);
}

export function touchPinnedBuilds(
  buildsRoot: string,
  root = DEFAULT_PROTOTYPE_RUN_REGISTRY_ROOT,
): number {
  const pinned = listPrototypeRuns(root).filter(run => run.retention === 'pinned');
  const now = new Date();
  let touched = 0;
  for (const run of pinned) {
    const buildPath = path.join(buildsRoot, run.buildId);
    if (!fs.existsSync(buildPath)) continue;
    try {
      fs.utimesSync(buildPath, now, now);
      touched += 1;
    } catch { /* best-effort LRU protection */ }
  }
  return touched;
}
