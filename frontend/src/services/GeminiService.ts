/**
 * GeminiService — вызов Gemini API двумя способами:
 * 1. Через Google OAuth token (бесплатно, если пользователь залогинен)
 * 2. Через API key (платно, fallback)
 *
 * Rate limits бесплатного Gemini:
 *   gemini-2.0-flash: 15 RPM, 1500 RPD (запросов в день)
 *   gemini-1.5-flash: 15 RPM, 1500 RPD
 */

import { ConfigService } from './ConfigService';

export type GeminiCallConfig = {
  prompt:             string;
  googleAccessToken?: string | null;  // из AuthContext
  maxTokens?:         number;
  onLog?:             (msg: string) => void;
};

// Ключи для хранения счётчика лимитов
const LIMIT_KEY     = 'gemini_free_limit';
const LIMIT_RESET   = 'gemini_free_limit_reset';
const DAILY_LIMIT   = 1400;  // 1500 - запас 100

function getRemainingFreeQuota(): number {
  try {
    const resetAt = localStorage.getItem(LIMIT_RESET);
    const today   = new Date().toDateString();
    if (resetAt !== today) {
      // Новый день — сбросить счётчик
      localStorage.setItem(LIMIT_KEY,   '0');
      localStorage.setItem(LIMIT_RESET, today);
      return DAILY_LIMIT;
    }
    const used = parseInt(localStorage.getItem(LIMIT_KEY) ?? '0', 10);
    return Math.max(0, DAILY_LIMIT - used);
  } catch { return 0; }
}

function incrementFreeUsage(): void {
  try {
    const used = parseInt(localStorage.getItem(LIMIT_KEY) ?? '0', 10);
    localStorage.setItem(LIMIT_KEY, String(used + 1));
  } catch {}
}

async function _callWithOAuth(
  prompt: string,
  accessToken: string,
  maxTokens: number,
): Promise<string> {
  const resp = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.8 },
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const error: any = new Error((err as any)?.error?.message ?? `HTTP ${resp.status}`);
    error.status = resp.status;
    throw error;
  }

  const data = await resp.json();
  return (data as any).candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function _callWithApiKey(
  prompt: string,
  apiKey: string,
  maxTokens: number,
): Promise<string> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.8 },
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const error: any = new Error((err as any)?.error?.message ?? `HTTP ${resp.status}`);
    error.status = resp.status;
    throw error;
  }

  const data = await resp.json();
  return (data as any).candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function _callOpenRouter(
  prompt: string,
  apiKey: string,
  maxTokens: number,
): Promise<string> {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'https://aic-rg.studio',
    },
    body: JSON.stringify({
      model:      ConfigService.resolveModel('primary'),
      max_tokens: maxTokens,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) throw new Error(`OpenRouter error: ${resp.status}`);
  const data = await resp.json();
  return (data as any).choices?.[0]?.message?.content ?? '';
}

export const GeminiService = {

  getRemainingFreeQuota,

  async generate(config: GeminiCallConfig): Promise<string> {
    const log = config.onLog ?? (() => {});

    // ── Путь 1: OAuth token (бесплатно) ──────────────────────────────────
    if (config.googleAccessToken && getRemainingFreeQuota() > 0) {
      try {
        log('[Gemini] Using free quota via Google OAuth…');
        const result = await _callWithOAuth(
          config.prompt,
          config.googleAccessToken,
          config.maxTokens ?? 4000,
        );
        incrementFreeUsage();
        const remaining = getRemainingFreeQuota();
        log(`[Gemini] ✅ Free quota used. Remaining today: ${remaining}`);
        return result;
      } catch (err: any) {
        const status = err?.status ?? 0;
        if (status === 429 || status === 403) {
          log('[Gemini] Free quota exhausted — switching to API key fallback');
        } else {
          log(`[Gemini] OAuth call failed (${status}) — trying API key`);
        }
        // Продолжаем на fallback
      }
    } else if (config.googleAccessToken && getRemainingFreeQuota() === 0) {
      log('[Gemini] Daily free quota reached — using API key fallback');
    }

    // ── Путь 2: Google API Key (настроен в Settings) ──────────────────────
    const googleApiKey = ConfigService.getGoogleApiKey();
    if (googleApiKey) {
      try {
        log('[Gemini] Using Google API key…');
        const result = await _callWithApiKey(
          config.prompt,
          googleApiKey,
          config.maxTokens ?? 4000,
        );
        log('[Gemini] ✅ Done via Google API key');
        return result;
      } catch (err: any) {
        log(`[Gemini] Google API key failed (${err?.status}) — trying OpenRouter`);
      }
    }

    // ── Путь 3: OpenRouter fallback (настроенные API ключи) ──────────────
    const openrouterKey = ConfigService.getApiKey();
    if (openrouterKey) {
      log('[Gemini] Falling back to OpenRouter…');
      return await _callOpenRouter(
        config.prompt,
        openrouterKey,
        config.maxTokens ?? 4000,
      );
    }

    throw new Error(
      'No AI service available. Sign in with Google or add an API key in Settings.'
    );
  },
};
