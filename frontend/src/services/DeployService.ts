/**
 * DeployService.ts
 *
 * One-click deploy на Vercel или Netlify прямо из браузера.
 * Не требует серверной части — использует публичные API с Bearer токеном.
 *
 * Vercel:  https://vercel.com/docs/rest-api
 * Netlify: https://docs.netlify.com/api/get-started/
 */

import type { FileMap } from '../hooks/useStudio';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DeployProvider = 'vercel' | 'netlify';

export type DeployStatus =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'building'
  | 'ready'
  | 'error';

export interface DeployResult {
  provider: DeployProvider;
  url:      string;          // финальный публичный URL
  deployId: string;
  status:   DeployStatus;
}

export interface DeployProgress {
  status:  DeployStatus;
  message: string;
  percent: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Конвертируем строку в base64 (для Vercel API) */
const toBase64 = (str: string): string => {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return btoa(str);
  }
};

/** Генерируем уникальное имя проекта */
const projectName = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

// ── Vercel ────────────────────────────────────────────────────────────────────

const deployToVercel = async (
  files: FileMap,
  token: string,
  onProgress: (p: DeployProgress) => void
): Promise<DeployResult> => {
  onProgress({ status: 'preparing', message: 'Подготовка файлов…', percent: 15 });

  const name = projectName('aicstudio');

  // Vercel ожидает массив файлов с data в base64
  const vercelFiles = Object.entries(files).map(([file, content]) => ({
    file,
    data: toBase64(content),
    encoding: 'base64',
  }));

  onProgress({ status: 'uploading', message: 'Загрузка на Vercel…', percent: 40 });

  const res = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      files: vercelFiles,
      projectSettings: {
        framework: null,         // static site
        outputDirectory: null,
        buildCommand: null,
        installCommand: null,
      },
      target: 'production',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message ?? `Vercel error ${res.status}`);
  }

  const data = await res.json();
  const deployId: string = data.id;

  onProgress({ status: 'building', message: 'Vercel строит проект…', percent: 65 });

  // Polling пока деплой не станет READY
  const url = await pollVercel(deployId, token, onProgress);

  return { provider: 'vercel', url, deployId, status: 'ready' };
};

const pollVercel = async (
  deployId: string,
  token: string,
  onProgress: (p: DeployProgress) => void
): Promise<string> => {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);

    const res = await fetch(`https://api.vercel.com/v13/deployments/${deployId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) continue;
    const data = await res.json();

    const state: string = data.status ?? data.readyState ?? '';
    const percent = 65 + Math.min(i * 3, 30);

    if (state === 'READY') {
      onProgress({ status: 'ready', message: '✓ Задеплоено!', percent: 100 });
      return `https://${data.url}`;
    }

    if (state === 'ERROR' || state === 'CANCELED') {
      throw new Error(`Vercel deployment ${state.toLowerCase()}`);
    }

    onProgress({
      status: 'building',
      message: `Vercel: ${state.toLowerCase()}…`,
      percent,
    });
  }
  throw new Error('Vercel deployment timeout');
};

// ── Netlify ───────────────────────────────────────────────────────────────────

const deployToNetlify = async (
  files: FileMap,
  token: string,
  onProgress: (p: DeployProgress) => void
): Promise<DeployResult> => {
  onProgress({ status: 'preparing', message: 'Создание Netlify сайта…', percent: 15 });

  // 1. Создаём сайт
  const siteRes = await fetch('https://api.netlify.com/api/v1/sites', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: projectName('aicstudio') }),
  });

  if (!siteRes.ok) {
    const err = await siteRes.json().catch(() => ({}));
    throw new Error(err?.message ?? `Netlify site creation error ${siteRes.status}`);
  }

  const site = await siteRes.json();
  const siteId: string = site.id;

  onProgress({ status: 'uploading', message: 'Загрузка файлов на Netlify…', percent: 40 });

  // 2. Считаем SHA1 для каждого файла (Netlify file digest API)
  const fileDigests: Record<string, string> = {};
  const encoder = new TextEncoder();

  for (const [path, content] of Object.entries(files)) {
    const hashBuffer = await crypto.subtle.digest('SHA-1', encoder.encode(content));
    const hashArray  = Array.from(new Uint8Array(hashBuffer));
    fileDigests[`/${path}`] = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // 3. Создаём деплой с хэшами
  const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: fileDigests }),
  });

  if (!deployRes.ok) {
    const err = await deployRes.json().catch(() => ({}));
    throw new Error(err?.message ?? `Netlify deploy error ${deployRes.status}`);
  }

  const deploy = await deployRes.json();
  const deployId: string = deploy.id;
  const required: string[] = deploy.required ?? [];

  onProgress({ status: 'uploading', message: `Загрузка ${required.length} файлов…`, percent: 55 });

  // 4. Загружаем только нужные файлы (которых ещё нет в CDN)
  for (const sha of required) {
    const entry = Object.entries(fileDigests).find(([, hash]) => hash === sha);
    if (!entry) continue;
    const [filePath] = entry;
    const fileName   = filePath.slice(1); // убираем leading /
    const content    = files[fileName] ?? '';

    await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}/files${filePath}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
      },
      body: content,
    });
  }

  onProgress({ status: 'building', message: 'Netlify финализирует деплой…', percent: 75 });

  // 5. Polling
  const url = await pollNetlify(deployId, token, onProgress);

  return { provider: 'netlify', url, deployId, status: 'ready' };
};

const pollNetlify = async (
  deployId: string,
  token: string,
  onProgress: (p: DeployProgress) => void
): Promise<string> => {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);

    const res = await fetch(`https://api.netlify.com/api/v1/deploys/${deployId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) continue;
    const data = await res.json();
    const state: string = data.state ?? '';
    const percent = 75 + Math.min(i * 3, 22);

    if (state === 'ready') {
      onProgress({ status: 'ready', message: '✓ Задеплоено!', percent: 100 });
      return `https://${data.ssl_url ?? data.url}`;
    }

    if (state === 'error') {
      throw new Error(`Netlify deploy error: ${data.error_message ?? 'unknown'}`);
    }

    onProgress({
      status: 'building',
      message: `Netlify: ${state}…`,
      percent,
    });
  }
  throw new Error('Netlify deployment timeout');
};

// ── Main export ───────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const DeployService = {
  /**
   * Деплоим FileMap на выбранный провайдер.
   *
   * @param files      — мультифайловая карта проекта
   * @param provider   — 'vercel' | 'netlify'
   * @param token      — API токен провайдера
   * @param onProgress — колбэк для обновления UI
   */
  async deploy(
    files: FileMap,
    provider: DeployProvider,
    token: string,
    onProgress: (p: DeployProgress) => void
  ): Promise<DeployResult> {
    if (!token.trim()) throw new Error('API токен не указан');
    if (Object.keys(files).length === 0) throw new Error('Нет файлов для деплоя');

    onProgress({ status: 'preparing', message: 'Инициализация…', percent: 5 });

    if (provider === 'vercel') {
      return deployToVercel(files, token.trim(), onProgress);
    } else {
      return deployToNetlify(files, token.trim(), onProgress);
    }
  },
};
