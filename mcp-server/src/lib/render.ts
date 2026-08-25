import { env } from '../env.js';

const BASE = 'https://api.render.com/v1';

async function renderFetch<T>(pathAndQuery: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${pathAndQuery}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.RENDER_API_KEY}`,
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Render API ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface RenderService {
  id: string;
  name: string;
  type: string;
  serviceDetails?: { url?: string };
}

export async function findBackendServiceId(): Promise<string> {
  if (env.RENDER_BACKEND_SERVICE_ID) return env.RENDER_BACKEND_SERVICE_ID;
  const list = await renderFetch<Array<{ service: RenderService }>>('/services?limit=20');
  const match = list.find(({ service }) => service.name === 'aicorn-ai-studio-backend');
  if (!match) throw new Error('Could not find aicorn-ai-studio-backend service on this Render account. Set RENDER_BACKEND_SERVICE_ID explicitly.');
  return match.service.id;
}

export async function triggerDeploy(serviceId: string, clearCache = false) {
  return renderFetch(`/services/${serviceId}/deploys`, {
    method: 'POST',
    body: JSON.stringify({ clearCache: clearCache ? 'clear' : 'do_not_clear' }),
  });
}

export async function listDeploys(serviceId: string, limit = 10) {
  return renderFetch(`/services/${serviceId}/deploys?limit=${limit}`);
}

export async function getService(serviceId: string) {
  return renderFetch<RenderService>(`/services/${serviceId}`);
}

/** Env var KEY names only — values are always stripped before returning. */
export async function listEnvVarKeys(serviceId: string): Promise<string[]> {
  const vars = await renderFetch<Array<{ envVar: { key: string } }>>(`/services/${serviceId}/env-vars?limit=100`);
  return vars.map(v => v.envVar.key);
}

export async function getLogs(serviceId: string, limit = 100) {
  return renderFetch(`/logs?resource=${serviceId}&limit=${limit}`);
}
