import 'dotenv/config';
import dotenv from 'dotenv';
import express from 'express';
import { execSync, spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const app = express();
const PORT = 3107;

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '10mb' }));

const SESSIONS_DIR    = path.join(process.cwd(), 'backend', 'sessions');
const MODE_FILE       = path.join(process.cwd(), 'backend', 'mode.json');
const CODEX_HOME_DIR  = path.join(process.cwd(), 'backend', '.codex-home');
const ENV_FILE        = path.join(process.cwd(), 'backend', '.env');

/** Maps provider ID → .env variable name */
const PROVIDER_ENV_KEYS: Record<string, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  anthropic:  'ANTHROPIC_API_KEY',
  openai:     'OPENAI_API_KEY',
  google:     'GOOGLE_API_KEY',
  deepseek:   'DEEPSEEK_API_KEY',
  mistral:    'MISTRAL_API_KEY',
  groq:       'GROQ_API_KEY',
};

/** Update or append a single KEY=VALUE line in a .env file */
function updateEnvFile(filePath: string, key: string, value: string): void {
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
  }
  const lines = content.split('\n');
  const lineIndex = lines.findIndex(l => l.startsWith(`${key}=`) || l.startsWith(`${key} =`));
  const newLine = `${key}=${value}`;
  if (lineIndex >= 0) {
    lines[lineIndex] = newLine;
  } else {
    if (content.length > 0 && !content.endsWith('\n')) lines.push('');
    lines.push(newLine);
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
if (!fs.existsSync(CODEX_HOME_DIR)) fs.mkdirSync(CODEX_HOME_DIR, { recursive: true });

console.log(`[auth-token] Sessions dir: ${SESSIONS_DIR}`);

interface ProjectSummary {
  idea: string;
  stack: string;
  implementedFeatures: string[];
  currentVersion: string;
  knownIssues: string[];
  lastUpdated: string;
}

interface ChatRequest {
  sessionId?: string;
  message: string;
  model?: string;
  system?: string;
}

interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SessionData {
  sessionId: string;
  projectSummary: ProjectSummary;
  messages: SessionMessage[];
  fullHistory: SessionMessage[];
  model: string;
  createdAt: string;
  updatedAt: string;
  requestCount: number;
}

interface BackgroundSummaryJob {
  sessionId: string;
  sessionSnapshot: SessionData;
  sessionFile: string;
  lastUserMessage: string;
  lastAssistantResponse: string;
}

export type DevAgentProvider = 'off' | 'claude' | 'codex';

interface ModeConfig {
  provider: DevAgentProvider;
  claudeMode?: boolean;
  updatedAt: string;
}

interface CliStatus {
  available: boolean;
  version: string | null;
  reason?: string;
}

const SYSTEM_PROMPT = `Ты senior React разработчик внутри Code Studio.
Твоя задача — создавать и итерировать React прототипы.
Ты помнишь всю историю работы над текущим прототипом.
Отвечай на языке пользователя (русский если пишут по-русски).
При генерации кода — всегда полный рабочий компонент.
Будь конкретным, без лишних слов.`;

const sessionLocks = new Map<string, Promise<void>>();
const MAX_FULL_HISTORY_MESSAGES = 400;
const MAX_SESSION_FILE_BYTES = 2 * 1024 * 1024;

const truncate = (text: string, max = 2000): string => (
  text.length > max ? text.slice(0, max) + '\n...[truncated]' : text
);

function readMode(): ModeConfig {
  try {
    if (fs.existsSync(MODE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(MODE_FILE, 'utf8')) as Partial<ModeConfig>;
      if (parsed.provider === 'off' || parsed.provider === 'claude' || parsed.provider === 'codex') {
        return {
          provider: parsed.provider,
          claudeMode: parsed.provider === 'claude',
          updatedAt: parsed.updatedAt || '',
        };
      }
      if (typeof parsed.claudeMode === 'boolean') {
        return {
          provider: parsed.claudeMode ? 'claude' : 'off',
          claudeMode: parsed.claudeMode,
          updatedAt: parsed.updatedAt || '',
        };
      }
    }
  } catch {
    // fallthrough to default mode
  }
  return { provider: 'claude', claudeMode: true, updatedAt: '' };
}

function writeMode(provider: DevAgentProvider): ModeConfig {
  const config: ModeConfig = {
    provider,
    claudeMode: provider === 'claude',
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(MODE_FILE, JSON.stringify(config, null, 2), 'utf8');
  console.log(`[mode] Switched to: ${provider}`);
  return config;
}

let currentMode = readMode();
console.log(`[mode] Starting in: ${currentMode.provider} mode`);

function makeSessionId(): string {
  return new Date().toISOString().slice(0, 10) + '_' + Math.random().toString(36).slice(2, 8);
}

function createDefaultProjectSummary(): ProjectSummary {
  return {
    idea: '',
    stack: '',
    implementedFeatures: [],
    currentVersion: 'v1',
    knownIssues: [],
    lastUpdated: new Date().toISOString(),
  };
}

function createEmptySession(sessionId: string, model: string): SessionData {
  const now = new Date().toISOString();
  return {
    sessionId,
    projectSummary: createDefaultProjectSummary(),
    messages: [],
    fullHistory: [],
    model,
    createdAt: now,
    updatedAt: now,
    requestCount: 0,
  };
}

function buildPrompt(session: SessionData, currentMessage: string): string {
  const parts: string[] = [];

  parts.push(`[System]\nТы senior React разработчик внутри Code Studio.\nТвоя задача — создавать и итерировать React прототипы.\nОтвечай на языке пользователя (русский если пишут по-русски).\nПри генерации кода — полный рабочий компонент.\nБудь конкретным, без лишних слов.`);

  if (session.projectSummary.idea) {
    const s = session.projectSummary;
    const features = s.implementedFeatures.length > 0
      ? s.implementedFeatures.map(f => `  - ${f}`).join('\n')
      : '  - пока ничего';
    const issues = s.knownIssues.length > 0
      ? s.knownIssues.map(i => `  - ${i}`).join('\n')
      : '  - нет';
    parts.push(`[Project Context]\nИдея: ${s.idea}\nСтек: ${s.stack}\nВерсия: ${s.currentVersion}\nРеализовано:\n${features}\nИзвестные проблемы:\n${issues}`);
  }

  if (session.messages.length > 0) {
    parts.push('[Recent History]');
    for (const msg of session.messages) {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      parts.push(`[${role}]\n${msg.content}`);
    }
  }

  parts.push(`[Current Message]\n[User]\n${currentMessage}`);

  return parts.join('\n\n');
}

function normalizeSessionData(raw: unknown, sessionId: string, model: string): SessionData {
  const fallback = createEmptySession(sessionId, model);
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Partial<SessionData>;
  const now = new Date().toISOString();
  const messages = Array.isArray(r.messages) ? r.messages.filter(Boolean) as SessionMessage[] : [];
  const fullHistory = Array.isArray(r.fullHistory) ? r.fullHistory.filter(Boolean) as SessionMessage[] : [...messages];
  const summary = r.projectSummary && typeof r.projectSummary === 'object'
    ? {
      idea: (r.projectSummary as Partial<ProjectSummary>).idea || '',
      stack: (r.projectSummary as Partial<ProjectSummary>).stack || '',
      implementedFeatures: Array.isArray((r.projectSummary as Partial<ProjectSummary>).implementedFeatures)
        ? (r.projectSummary as Partial<ProjectSummary>).implementedFeatures!.filter(Boolean)
        : [],
      currentVersion: (r.projectSummary as Partial<ProjectSummary>).currentVersion || 'v1',
      knownIssues: Array.isArray((r.projectSummary as Partial<ProjectSummary>).knownIssues)
        ? (r.projectSummary as Partial<ProjectSummary>).knownIssues!.filter(Boolean)
        : [],
      lastUpdated: (r.projectSummary as Partial<ProjectSummary>).lastUpdated || now,
    }
    : createDefaultProjectSummary();

  return {
    sessionId,
    projectSummary: summary,
    messages,
    fullHistory,
    model: r.model || model,
    createdAt: r.createdAt || now,
    updatedAt: r.updatedAt || now,
    requestCount: typeof r.requestCount === 'number'
      ? r.requestCount
      : fullHistory.filter(m => m.role === 'user').length,
  };
}

function readSessionData(sessionFile: string, sessionId: string, model: string): SessionData {
  if (!fs.existsSync(sessionFile)) return createEmptySession(sessionId, model);
  try {
    const parsed = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    return normalizeSessionData(parsed, sessionId, model);
  } catch {
    return createEmptySession(sessionId, model);
  }
}

function writeSessionData(sessionFile: string, session: SessionData): void {
  // Keep storage bounded in case sessions become very long.
  while (session.fullHistory.length > MAX_FULL_HISTORY_MESSAGES) {
    session.fullHistory = session.fullHistory.slice(2);
  }

  // Best-effort byte-size protection for extreme responses/history growth.
  let serialized = JSON.stringify(session, null, 2);
  while (Buffer.byteLength(serialized, 'utf8') > MAX_SESSION_FILE_BYTES && session.fullHistory.length > 20) {
    session.fullHistory = session.fullHistory.slice(2);
    serialized = JSON.stringify(session, null, 2);
  }

  fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2), 'utf8');
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Fast path: already valid JSON object.
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  // Try to find the first balanced JSON object inside noisy text.
  const start = trimmed.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (depth === 0) {
      return trimmed.slice(start, i + 1);
    }
  }

  return null;
}

function cleanupOldSessions() {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return;
    const dirs = fs.readdirSync(SESSIONS_DIR)
      .map(d => ({
        name: d,
        path: path.join(SESSIONS_DIR, d),
        mtime: fs.statSync(path.join(SESSIONS_DIR, d)).mtime,
      }))
      .filter(d => fs.statSync(d.path).isDirectory())
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    const toDelete = dirs.slice(50);
    for (const d of toDelete) {
      fs.rmSync(d.path, { recursive: true, force: true });
      console.log(`[cleanup] Deleted old session: ${d.name}`);
    }
    if (toDelete.length > 0) {
      console.log(`[cleanup] Removed ${toDelete.length} old sessions`);
    } else {
      console.log('[cleanup] Nothing to remove');
    }
  } catch (err) {
    console.log('[cleanup] Failed:', String(err));
  }
}

function resolveCodexCommand(): string {
  const envOverride = process.env.CODEX_BIN?.trim();
  if (envOverride) return envOverride;

  if (process.platform === 'win32') {
    const userHome = process.env.USERPROFILE || os.homedir();
    const extRoot = path.join(userHome, '.vscode', 'extensions');
    try {
      if (fs.existsSync(extRoot)) {
        const candidates = fs.readdirSync(extRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory() && d.name.startsWith('openai.chatgpt-'))
          .map((d) => d.name)
          .sort((a, b) => b.localeCompare(a));

        for (const name of candidates) {
          const exePath = path.join(extRoot, name, 'bin', 'windows-x86_64', 'codex.exe');
          if (fs.existsSync(exePath)) return exePath;
        }
      }
    } catch {
      // fall back to PATH lookup
    }
  }

  return 'codex';
}

function resolveCodexEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CODEX_HOME: process.env.CODEX_HOME?.trim() || CODEX_HOME_DIR,
  };
}

function getClaudeCliStatus(): CliStatus {
  try {
    const version = execSync('claude --version', {
      timeout: 3000,
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    }).toString().trim();
    return {
      available: !!process.env.CLAUDE_CODE_OAUTH_TOKEN,
      version,
    };
  } catch (err: any) {
    return { available: false, version: null, reason: String(err?.message || err) };
  }
}

function getCodexCliStatus(): CliStatus {
  const cmd = resolveCodexCommand();
  const codexEnv = resolveCodexEnv();
  const versionProbe = spawnSync(cmd, ['--version'], {
    timeout: 3000,
    env: codexEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const versionOk = versionProbe.status === 0;
  const versionStdout = (versionProbe.stdout || '').toString().trim();
  const versionStderr = (versionProbe.stderr || '').toString().trim();
  const versionCode = typeof versionProbe.status === 'number' ? versionProbe.status : -1;
  if (!versionOk) {
    return {
      available: false,
      version: null,
      reason: (versionStderr || versionStdout || `exit ${versionCode}`).slice(0, 240),
    };
  }

  // codex can print version even when auth/config is broken; verify actual runtime readiness.
  const loginProbe = spawnSync(cmd, ['login', 'status'], {
    timeout: 3000,
    env: codexEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const loginOk = loginProbe.status === 0;
  const loginStdout = (loginProbe.stdout || '').toString().trim();
  const loginStderr = (loginProbe.stderr || '').toString().trim();
  const loginCode = typeof loginProbe.status === 'number' ? loginProbe.status : -1;
  if (!loginOk) {
    return {
      available: false,
      version: versionStdout || null,
      reason: (loginStderr || loginStdout || `exit ${loginCode}`).slice(0, 240),
    };
  }

  return { available: true, version: versionStdout || null };
}

function isProviderAvailable(provider: Exclude<DevAgentProvider, 'off'>): boolean {
  return provider === 'codex'
    ? getCodexCliStatus().available
    : getClaudeCliStatus().available;
}

function describeProvider(provider: DevAgentProvider): string {
  if (provider === 'claude') return 'Claude CLI';
  if (provider === 'codex') return 'OpenAI Codex CLI';
  return 'Standard Agents';
}

async function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const existing = sessionLocks.get(sessionId) ?? Promise.resolve();
  let releaseLock!: () => void;
  const newLock = new Promise<void>((resolve) => { releaseLock = resolve; });
  const queued = existing.then(() => newLock);
  sessionLocks.set(sessionId, queued);

  await existing;
  try {
    return await fn();
  } finally {
    releaseLock();
    if (sessionLocks.get(sessionId) === queued) {
      sessionLocks.delete(sessionId);
    }
  }
}

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';
export const DEFAULT_CODEX_MODEL = 'gpt-5.1-codex';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';

type AgentConfigLike = {
  provider?: string;
  modelId?: string;
};

function readAgentConfigMap(): Record<string, AgentConfigLike> {
  try {
    if (!fs.existsSync(AGENT_CONFIG_FILE)) return {};
    const raw = fs.readFileSync(AGENT_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, AgentConfigLike>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function getPrimaryAgentConfig(): AgentConfigLike {
  const all = readAgentConfigMap();
  const cfg = all.agent_primary;
  return cfg && typeof cfg === 'object' ? cfg : {};
}

function resolveStandardModel(model?: string): string {
  const configured = (getPrimaryAgentConfig().modelId || '').trim();
  if (configured) return configured;
  const requested = (model || '').trim();
  if (requested) return requested;
  return DEFAULT_OPENROUTER_MODEL;
}

/** On Windows: resolve claude.cmd via `where` so spawn works without shell:true */
function resolveClaudeExecutable(): string {
  if (process.platform !== 'win32') return 'claude';
  try {
    const result = execSync('where claude', { timeout: 3000 })
      .toString().trim().split('\n');
    // prefer .cmd over bare shim
    const cmd = result.find(r => r.trim().endsWith('.cmd')) || result[0];
    return cmd?.trim() || 'claude';
  } catch {
    return 'claude';
  }
}

export function resolveClaudeModel(model?: string): string {
  if (!model) return DEFAULT_CLAUDE_MODEL;
  if (model.startsWith('gpt-')) return DEFAULT_CLAUDE_MODEL;
  // Strip OpenRouter-style prefix (e.g. 'anthropic/claude-sonnet-4-6' → 'claude-sonnet-4-6')
  const stripped = model.includes('/') ? model.split('/').pop()! : model;
  return stripped || DEFAULT_CLAUDE_MODEL;
}

export function resolveCodexModel(model?: string): string {
  if (!model || model.startsWith('claude-')) return DEFAULT_CODEX_MODEL;
  return model;
}

export function resolveDevAgentModel(provider: DevAgentProvider, model?: string): string {
  return provider === 'codex'
    ? resolveCodexModel(model)
    : resolveClaudeModel(model);
}

export function runClaudePrompt(
  prompt: string,
  model: string,
  spawnFn: typeof spawn = spawn,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    console.log('[chat] launching claude cli...');

    const claudeExe = resolveClaudeExecutable();
    const child = spawnFn(claudeExe, [
      '-p',
      '--output-format', 'text',
      '--model', model,
    ], {
      env: {
        ...process.env,
        CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN || '',
      },
      shell: false,
      timeout: 300_000,
    });

    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.stderr.on('data', (c: Buffer) => errChunks.push(c));

    child.on('close', (code) => {
      const errText = Buffer.concat(errChunks).toString('utf8');
      const outText = Buffer.concat(chunks).toString('utf8');
      console.log(`[chat] exit code: ${code}`);
      console.log(`[chat] stdout: ${outText.slice(0, 300)}`);
      if (errText) console.log(`[chat] stderr: ${errText.slice(0, 300)}`);
      if (code !== 0) {
        const reason = (errText || outText || '').trim();
        reject(new Error(`claude exited with code ${code}: ${reason}`));
      } else {
        resolve(outText);
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

export function runCodexPrompt(
  prompt: string,
  model: string,
  spawnFn: typeof spawn = spawn,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    console.log('[chat] launching codex cli...');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-bridge-'));
    const outputFile = path.join(tempDir, 'last-message.txt');

    const codexCommand = resolveCodexCommand();
    const child = spawnFn(codexCommand, [
      'exec',
      '--color', 'never',
      '--full-auto',
      '--cd', process.cwd(),
      '--model', model,
      '--output-last-message', outputFile,
      '-',
    ], {
      env: {
        ...resolveCodexEnv(),
      },
      shell: false,
      timeout: 300_000,
    });

    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => outChunks.push(c));
    child.stderr.on('data', (c: Buffer) => errChunks.push(c));

    const cleanup = () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore temp cleanup failures
      }
    };

    child.on('close', (code) => {
      const errText = Buffer.concat(errChunks).toString('utf8').trim();
      const outTextRaw = Buffer.concat(outChunks).toString('utf8').trim();
      try {
        if (code !== 0) {
          cleanup();
          const reason = (errText || outTextRaw || '').slice(0, 500);
          reject(new Error(`codex exited with code ${code} [cmd=${codexCommand}]: ${reason}`));
          return;
        }

        const outText = fs.existsSync(outputFile)
          ? fs.readFileSync(outputFile, 'utf8').trim()
          : '';
        cleanup();

        if (!outText) {
          reject(new Error(`codex returned empty output${errText ? `: ${errText}` : outTextRaw ? `: ${outTextRaw}` : ''}`));
          return;
        }

        resolve(outText);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    child.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

export function runDevAgentPrompt(
  provider: Exclude<DevAgentProvider, 'off'>,
  prompt: string,
  model: string,
  spawnFn: typeof spawn = spawn,
): Promise<string> {
  return provider === 'codex'
    ? runCodexPrompt(prompt, resolveCodexModel(model), spawnFn)
    : runClaudePrompt(prompt, resolveClaudeModel(model), spawnFn);
}

async function runStandardAgents(
  prompt: string,
  model: string,
): Promise<string> {
  const normalize = (value: string): string => value.trim().toLowerCase();
  const rawModel = (model || '').trim();
  const lowerModel = normalize(rawModel);
  const openrouterKey = (process.env.OPENROUTER_API_KEY || '').trim();
  const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  const primaryCfg = getPrimaryAgentConfig();
  const primaryProvider = normalize(primaryCfg.provider || '');
  const explicitProvider = lowerModel.includes('/') ? lowerModel.split('/')[0] : '';
  const wantsAnthropic = explicitProvider === 'anthropic' || lowerModel.startsWith('claude-');

  // Operator settings have priority:
  // - provider=anthropic  → native Anthropic endpoint
  // - provider=openrouter → OpenRouter endpoint (even for anthropic/* models)
  // - provider missing    → infer from model intent
  const configuredProvider = primaryProvider || '';
  const useAnthropic = configuredProvider
    ? configuredProvider === 'anthropic'
    : wantsAnthropic;
  const apiKey = useAnthropic ? anthropicKey : openrouterKey;
  const endpoint = useAnthropic
    ? 'https://api.anthropic.com/v1/messages'
    : 'https://openrouter.ai/api/v1/chat/completions';

  if (!apiKey) {
    throw new Error(
      useAnthropic
        ? 'No Anthropic API key configured for Standard Agents mode. Configure it in Settings.'
        : 'No OpenRouter API key configured for Standard Agents mode. Configure it in Settings.',
    );
  }

  if (useAnthropic) {
    const explicitProvider = lowerModel.includes('/') ? lowerModel.split('/')[0] : '';
    const anthropicModel = (() => {
      // anthropic/claude-* → strip provider prefix
      if (explicitProvider === 'anthropic' && rawModel.includes('/')) {
        return rawModel.split('/').slice(1).join('/');
      }
      // claude-* (already native Anthropic model id)
      if (lowerModel.startsWith('claude-')) {
        return rawModel;
      }
      // Any non-Anthropic model while provider=anthropic → safe Claude fallback
      return DEFAULT_CLAUDE_MODEL;
    })();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API ${response.status}: ${err.slice(0, 300)}`);
    }
    const data = await response.json() as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? '';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: rawModel || DEFAULT_OPENROUTER_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API ${response.status}: ${err.slice(0, 300)}`);
  }
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

async function updateProjectSummary(
  session: SessionData,
  lastUserMessage: string,
  lastAssistantResponse: string,
): Promise<ProjectSummary> {
  const summaryPrompt = `Ты анализируешь историю разработки React прототипа.
На основе последнего обмена обнови JSON саммари проекта.

Текущее саммари:
${JSON.stringify(session.projectSummary, null, 2)}

Последнее сообщение пользователя:
${lastUserMessage}

Последний ответ ассистента:
${lastAssistantResponse.slice(0, 1000)}

Верни ТОЛЬКО валидный JSON без markdown, без пояснений:
{
  "idea": "суть идеи одной фразой",
  "stack": "стек через запятую",
  "implementedFeatures": ["фича 1", "фича 2"],
  "currentVersion": "v1",
  "knownIssues": ["проблема 1"],
  "lastUpdated": "${new Date().toISOString()}"
}

Правила:
- idea: если пользователь описал идею — запиши её, иначе оставь текущую
- implementedFeatures: добавляй новые реализованные фичи, не удаляй старые
- currentVersion: увеличивай если была значительная правка
- knownIssues: добавляй если пользователь упомянул проблему, убирай если починили
- Верни только JSON, никакого текста вокруг`;

  try {
    const activeMode = readMode();
    const activeProvider = activeMode.provider;
    const summaryText = activeProvider !== 'off' && isProviderAvailable(activeProvider)
      ? await runDevAgentPrompt(activeProvider, summaryPrompt, resolveDevAgentModel(activeProvider, activeProvider === 'codex' ? DEFAULT_CODEX_MODEL : 'claude-haiku-4-5-20251001'))
      : await runStandardAgents(summaryPrompt, resolveStandardModel(session.model));
    const clean = summaryText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    const jsonText = extractJsonObject(clean) || clean;
    const parsed = JSON.parse(jsonText) as ProjectSummary;
    parsed.lastUpdated = new Date().toISOString();

    if (!Array.isArray(parsed.implementedFeatures)) parsed.implementedFeatures = [];
    if (!Array.isArray(parsed.knownIssues)) parsed.knownIssues = [];
    parsed.idea = parsed.idea || session.projectSummary.idea || '';
    parsed.stack = parsed.stack || session.projectSummary.stack || '';
    parsed.currentVersion = parsed.currentVersion || session.projectSummary.currentVersion || 'v1';

    return parsed;
  } catch (err) {
    console.log('[summary] Failed to update, keeping current:', String(err));
    return session.projectSummary;
  }
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', provider: readMode().provider });
});

app.get('/token', (_req, res) => {
  const claude = getClaudeCliStatus();
  const codex = getCodexCliStatus();
  res.json({
    hasToken: claude.available || codex.available,
    provider: 'dev-agent-bridge',
    version: claude.version,
    claude,
    codex,
  });
});

app.get('/dev-agent-mode', (_req, res) => {
  const mode = readMode();
  const claude = getClaudeCliStatus();
  const codex = getCodexCliStatus();
  const providerAvailable = mode.provider !== 'off' && isProviderAvailable(mode.provider);
  res.json({
    provider: mode.provider,
    claudeMode: mode.claudeMode,
    claudeAvailable: claude.available,
    codexAvailable: codex.available,
    providers: {
      claude,
      codex,
    },
    updatedAt: mode.updatedAt,
    activeProvider: providerAvailable ? describeProvider(mode.provider) : 'Standard Agents',
  });
});

app.post('/dev-agent-mode', (req, res) => {
  const requestedProvider = (req.body as { provider?: DevAgentProvider })?.provider;
  if (requestedProvider !== 'off' && requestedProvider !== 'claude' && requestedProvider !== 'codex') {
    return res.status(400).json({ error: 'provider must be off, claude, or codex' });
  }

  const newMode = writeMode(requestedProvider);
  currentMode = newMode;
  const claude = getClaudeCliStatus();
  const codex = getCodexCliStatus();
  const providerAvailable = newMode.provider !== 'off' && isProviderAvailable(newMode.provider);
  res.json({
    provider: newMode.provider,
    claudeMode: newMode.claudeMode,
    claudeAvailable: claude.available,
    codexAvailable: codex.available,
    providers: {
      claude,
      codex,
    },
    activeProvider: providerAvailable ? describeProvider(newMode.provider) : 'Standard Agents',
    updatedAt: newMode.updatedAt,
  });
});

// Legacy compatibility for old frontend callers.
app.get('/claude-mode', (_req, res) => {
  const mode = readMode();
  const claude = getClaudeCliStatus();
  res.json({
    provider: mode.provider,
    claudeMode: mode.claudeMode,
    claudeAvailable: claude.available,
    updatedAt: mode.updatedAt,
    activeProvider: mode.provider === 'claude' && claude.available
      ? describeProvider('claude')
      : 'Standard Agents',
  });
});

app.post('/claude-mode/toggle', (_req, res) => {
  const current = readMode();
  const newMode = writeMode(current.provider === 'claude' ? 'off' : 'claude');
  currentMode = newMode;
  const claude = getClaudeCliStatus();
  res.json({
    provider: newMode.provider,
    claudeMode: newMode.claudeMode,
    claudeAvailable: claude.available,
    activeProvider: newMode.provider === 'claude' && claude.available
      ? describeProvider('claude')
      : 'Standard Agents',
    updatedAt: newMode.updatedAt,
  });
});

app.get('/sessions', (_req, res) => {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return res.json([]);
    const dirs = fs.readdirSync(SESSIONS_DIR).filter(d =>
      fs.statSync(path.join(SESSIONS_DIR, d)).isDirectory()
    );
    const sessions = dirs.map(d => {
      const metaPath = path.join(SESSIONS_DIR, d, 'session.json');
      try {
        const meta = normalizeSessionData(
          JSON.parse(fs.readFileSync(metaPath, 'utf8')),
          d,
          DEFAULT_CLAUDE_MODEL,
        );
        const files = fs.readdirSync(path.join(SESSIONS_DIR, d));
        const sizeKb = Math.round(files.reduce((acc, f) => {
          try { return acc + fs.statSync(path.join(SESSIONS_DIR, d, f)).size; } catch { return acc; }
        }, 0) / 1024);
        return {
          sessionId: meta.sessionId,
          requests: typeof meta.requestCount === 'number'
            ? meta.requestCount
            : (meta.messages || []).filter(m => m.role === 'user').length,
          lastModel: meta.model || DEFAULT_CLAUDE_MODEL,
          lastRequestAt: meta.updatedAt || new Date().toISOString(),
          sizeKb,
        };
      } catch { return { sessionId: d, requests: 0, sizeKb: 0 }; }
    });
    sessions.sort((a, b) =>
      (b.lastRequestAt || '').localeCompare(a.lastRequestAt || '')
    );
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete('/sessions/:sessionId', (req, res) => {
  const sessionDir = path.join(SESSIONS_DIR, req.params.sessionId);
  if (!fs.existsSync(sessionDir)) return res.status(404).json({ error: 'Not found' });
  fs.rmSync(sessionDir, { recursive: true, force: true });
  res.json({ deleted: true, sessionId: req.params.sessionId });
});

app.post('/sessions/new', (req, res) => {
  const {
    idea = '',
    stack = '',
    features = [],
  } = req.body as {
    idea?: string;
    stack?: string;
    features?: string[];
  };

  const sessionId = makeSessionId();
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const safeFeatures = Array.isArray(features) ? features.filter(Boolean) : [];

  const session: SessionData = {
    sessionId,
    projectSummary: {
      idea,
      stack: stack || 'React + TypeScript + Tailwind',
      implementedFeatures: safeFeatures,
      currentVersion: 'v1',
      knownIssues: [],
      lastUpdated: new Date().toISOString(),
    },
    messages: [],
    fullHistory: [],
    model: resolveStandardModel(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    requestCount: 0,
  };

  const sessionFile = path.join(sessionDir, 'session.json');
  writeSessionData(sessionFile, session);

  console.log(`[sessions] Created: ${sessionId}, idea: "${idea || 'empty'}"`);
  res.json({ sessionId, created: true, projectSummary: session.projectSummary });
});

app.get('/sessions/:sessionId', (req, res) => {
  const sessionFile = path.join(SESSIONS_DIR, req.params.sessionId, 'session.json');
  if (!fs.existsSync(sessionFile)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  res.json(session);
});

app.post('/chat', async (req, res) => {
  const startTime = Date.now();
  try {
    const { sessionId: incomingSessionId, message, model } = req.body as ChatRequest;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    const resolvedSessionId = incomingSessionId || makeSessionId();
    let backgroundJob: BackgroundSummaryJob | null = null;

    await withSessionLock(resolvedSessionId, async () => {
      const sessionDir = path.join(SESSIONS_DIR, resolvedSessionId);
      if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

      const sessionFile = path.join(sessionDir, 'session.json');
      const activeMode = readMode();
      const requestedModel = activeMode.provider !== 'off'
        ? resolveDevAgentModel(activeMode.provider, model)
        : resolveStandardModel(model);
      const sessionData = readSessionData(sessionFile, resolvedSessionId, requestedModel);

      const resolvedModel = activeMode.provider !== 'off'
        ? resolveDevAgentModel(activeMode.provider, model || sessionData.model)
        : resolveStandardModel(model || sessionData.model);
      const userMessage = message.trim();
      const prompt = buildPrompt(sessionData, userMessage);

      console.log(`[chat] session: ${resolvedSessionId}, model: ${resolvedModel}, prompt: ${prompt.length} chars`);

      let responseText: string;
      if (activeMode.provider !== 'off' && isProviderAvailable(activeMode.provider)) {
        console.log(`[chat] Provider: ${describeProvider(activeMode.provider)}`);
        responseText = await runDevAgentPrompt(activeMode.provider, prompt, resolvedModel);
      } else if (activeMode.provider !== 'off') {
        const status = activeMode.provider === 'codex' ? getCodexCliStatus() : getClaudeCliStatus();
        return res.status(503).json({
          error: `${describeProvider(activeMode.provider)} is not available`,
          provider: activeMode.provider,
          details: status.reason || 'CLI not found or not authorized',
        });
      } else {
        console.log('[chat] Provider: Standard Agents');
        responseText = await runStandardAgents(prompt, resolvedModel);
      }

      sessionData.fullHistory.push({ role: 'user', content: userMessage });
      sessionData.fullHistory.push({ role: 'assistant', content: responseText });

      sessionData.messages.push({ role: 'user', content: truncate(userMessage) });
      sessionData.messages.push({ role: 'assistant', content: truncate(responseText) });
      if (sessionData.messages.length > 20) {
        sessionData.messages = sessionData.messages.slice(-20);
      }

      sessionData.model = resolvedModel;
      sessionData.updatedAt = new Date().toISOString();
      sessionData.requestCount = sessionData.fullHistory.filter(m => m.role === 'user').length;
      if (!sessionData.createdAt) sessionData.createdAt = new Date().toISOString();

      writeSessionData(sessionFile, sessionData);

      const reqNum = String(sessionData.requestCount).padStart(3, '0');
      const promptFile = path.join(sessionDir, `${reqNum}_prompt.txt`);
      const responseFile = path.join(sessionDir, `${reqNum}_response.txt`);
      fs.writeFileSync(promptFile, userMessage, 'utf8');
      fs.writeFileSync(responseFile, responseText, 'utf8');
      console.log(`[chat] saved → ${reqNum}_response.txt (${responseText.length} chars)`);

      res.json({
        content: [{ type: 'text', text: responseText }],
        stop_reason: 'end_turn',
        sessionId: resolvedSessionId,
        messageCount: sessionData.messages.length,
      });

      backgroundJob = {
        sessionId: resolvedSessionId,
        sessionSnapshot: sessionData,
        sessionFile,
        lastUserMessage: userMessage,
        lastAssistantResponse: responseText,
      };
    });

    const job = backgroundJob as BackgroundSummaryJob | null;
    if (job) {
      updateProjectSummary(
        job.sessionSnapshot,
        job.lastUserMessage,
        job.lastAssistantResponse,
      ).then((newSummary) => {
        withSessionLock(job.sessionId, async () => {
          const latest = readSessionData(
            job.sessionFile,
            job.sessionId,
            job.sessionSnapshot.model,
          );
          latest.projectSummary = newSummary;
          latest.updatedAt = new Date().toISOString();
          writeSessionData(job.sessionFile, latest);
          console.log(`[summary] Updated: ${newSummary.idea || 'no idea yet'}, features: ${newSummary.implementedFeatures.length}`);
        }).catch((err) => {
          console.log('[summary] Background lock failed:', String(err));
        });
      }).catch((err) => {
        console.log('[summary] Background update failed:', String(err));
      });
    }
  } catch (err) {
    console.error(`[chat] error after ${Date.now() - startTime}ms:`, String(err));
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
});

// ── GET /provider-keys — flags only (no key values) ──────────────────────────
app.get('/provider-keys', (_req, res) => {
  const result: Record<string, boolean> = {};
  for (const [provider, envKey] of Object.entries(PROVIDER_ENV_KEYS)) {
    result[provider] = Boolean(process.env[envKey]?.trim());
  }
  res.json(result);
});

// ── POST /provider-keys — write one key to .env ───────────────────────────────
app.post('/provider-keys', (req, res) => {
  try {
    const { provider, key } = req.body as { provider: string; key: string };
    if (!provider || typeof provider !== 'string' || typeof key !== 'string') {
      return res.status(400).json({ error: 'Body must contain { provider: string, key: string }' });
    }
    const envKey = PROVIDER_ENV_KEYS[provider];
    if (!envKey) return res.status(400).json({ error: `Unknown provider: ${provider}` });

    updateEnvFile(ENV_FILE, envKey, key);
    process.env[envKey] = key;           // live-update without restart
    dotenv.config({ path: ENV_FILE, override: true });
    console.log(`[provider-keys] Saved ${provider} key`);
    res.json({ ok: true, provider });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /provider-key/:provider — return actual key (localhost only) ──────────
app.get('/provider-key/:provider', (req, res) => {
  const remoteIp = req.socket.remoteAddress ?? '';
  const isLocal  = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
  if (!isLocal) return res.status(403).json({ error: 'Forbidden' });

  const { provider } = req.params;
  const envKey = PROVIDER_ENV_KEYS[provider];
  if (!envKey) return res.status(400).json({ error: `Unknown provider: ${provider}` });

  const key = process.env[envKey] ?? '';
  res.json({ key });
});

// ── Agent config file path ────────────────────────────────────────────────────
const AGENT_CONFIG_FILE = path.join(process.cwd(), 'backend', 'agent-config.json');

// ── GET /agent-config ─────────────────────────────────────────────────────────
app.get('/agent-config', (_req, res) => {
  try {
    if (!fs.existsSync(AGENT_CONFIG_FILE)) {
      return res.status(404).json({ error: 'agent-config.json not found' });
    }
    const raw = fs.readFileSync(AGENT_CONFIG_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /agent-config ────────────────────────────────────────────────────────
app.post('/agent-config', (req, res) => {
  try {
    const { agentId, config } = req.body as { agentId: string; config: Record<string, unknown> };
    if (!agentId || typeof agentId !== 'string' || !config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Body must contain { agentId: string, config: object }' });
    }

    let current: Record<string, unknown> = {};
    if (fs.existsSync(AGENT_CONFIG_FILE)) {
      try { current = JSON.parse(fs.readFileSync(AGENT_CONFIG_FILE, 'utf8')) as Record<string, unknown>; } catch { /* start fresh */ }
    }

    // Merge with existing entry so fields like maxTokens (edited directly in the
    // file) are preserved even when the UI saves only provider/modelId fields.
    const existing = (current[agentId] && typeof current[agentId] === 'object')
      ? (current[agentId] as Record<string, unknown>)
      : {};
    current[agentId] = { ...existing, ...config };
    fs.writeFileSync(AGENT_CONFIG_FILE, JSON.stringify(current, null, 2), 'utf8');
    console.log(`[agent-config] Updated ${agentId}`);
    res.json({ ok: true, agentId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── PUT /agent-config/reset — restore factory defaults ───────────────────────
const AGENT_CONFIG_DEFAULTS = {
  agent_primary: { provider: 'openrouter', modelId: DEFAULT_OPENROUTER_MODEL, fallback1Provider: 'openrouter', fallback1ModelId: 'openai/gpt-4o-mini' },
  agent_build:   { provider: 'openrouter', modelId: DEFAULT_OPENROUTER_MODEL, fallback1Provider: 'openrouter', fallback1ModelId: 'openai/gpt-4o-mini' },
  agent_fix:     { provider: 'openrouter', modelId: 'openai/gpt-4o-mini',          fallback1Provider: 'openrouter', fallback1ModelId: 'openai/gpt-4o-mini' },
  agent_spec:    { provider: 'openrouter', modelId: DEFAULT_OPENROUTER_MODEL, fallback1Provider: 'openrouter', fallback1ModelId: 'openai/gpt-4o-mini' },
  agent_qa:      { provider: 'openrouter', modelId: 'openai/gpt-4o-mini',          fallback1Provider: 'openrouter', fallback1ModelId: 'openai/gpt-4o-mini' },
};

app.put('/agent-config/reset', (_req, res) => {
  try {
    fs.writeFileSync(AGENT_CONFIG_FILE, JSON.stringify(AGENT_CONFIG_DEFAULTS, null, 2), 'utf8');
    console.log('[agent-config] Reset to defaults');
    res.json({ ok: true, defaults: AGENT_CONFIG_DEFAULTS });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export function startServer(port = PORT) {
  // Bind to loopback only — this server is a local dev helper and must not
  // be reachable from the network. All routes assume a trusted local caller.
  return app.listen(port, '127.0.0.1', () => {
    console.log(`[auth-token] Running on http://127.0.0.1:${port} (loopback only)`);
    console.log(`[auth-token] Provider: Claude Code CLI`);
    cleanupOldSessions();
  });
}

if (process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') {
  startServer();
}
