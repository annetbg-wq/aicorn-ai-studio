/**
 * llm-service.ts — lightweight LLM caller for the backend planner.
 * Detects the user's language and builds a language-aware system prompt
 * so the model always responds in the user's own language.
 */

// ── Language detection ────────────────────────────────────────────────────────

/**
 * Detect the dominant script / language of a short text.
 * Returns a BCP-47 language tag (e.g. "ru", "en", "zh", "ar", "es").
 * Falls back to "en" when no strong signal is found.
 */
export function detectLang(text: string): string {
  if (!text || text.trim().length === 0) return 'en';

  const counts: Record<string, number> = {};
  const inc = (lang: string) => { counts[lang] = (counts[lang] ?? 0) + 1; };

  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0400 && cp <= 0x04FF) inc('ru');          // Cyrillic
    else if (cp >= 0x4E00 && cp <= 0x9FFF) inc('zh');     // CJK unified
    else if (cp >= 0x3040 && cp <= 0x30FF) inc('ja');     // Hiragana / Katakana
    else if (cp >= 0xAC00 && cp <= 0xD7AF) inc('ko');     // Hangul
    else if (cp >= 0x0600 && cp <= 0x06FF) inc('ar');     // Arabic
    else if (cp >= 0x0590 && cp <= 0x05FF) inc('he');     // Hebrew
    else if (cp >= 0x0900 && cp <= 0x097F) inc('hi');     // Devanagari
    else if (cp >= 0x0041 && cp <= 0x024F) inc('latin'); // Basic + extended Latin
  }

  // Pick the script with the most characters
  let top = 'latin';
  let topCount = counts['latin'] ?? 0;
  for (const [lang, count] of Object.entries(counts)) {
    if (lang !== 'latin' && count > topCount) { top = lang; topCount = count; }
  }

  return top === 'latin' ? 'en' : top;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LLMConfig {
  systemPrompt: string;
  userPrompt:   string;
  apiKey:       string;
  modelId?:     string;
  maxTokens?:   number;
  signal?:      AbortSignal;
}

export interface LLMResponse {
  content: string;
}

// ── OpenRouter call ───────────────────────────────────────────────────────────

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL       = 'google/gemini-2.0-flash-001';
const DEFAULT_MAX_TOKENS  = 4096;

export async function callLLM(config: LLMConfig): Promise<LLMResponse> {
  const { systemPrompt, userPrompt, apiKey, signal } = config;
  const modelId    = config.modelId    ?? DEFAULT_MODEL;
  const maxTokens  = config.maxTokens  ?? DEFAULT_MAX_TOKENS;

  const body = JSON.stringify({
    model: modelId,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
  });

  const res = await fetch(OPENROUTER_ENDPOINT, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body,
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM request failed: ${res.status} ${res.statusText} — ${text}`);
  }

  const json = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? '';
  return { content };
}

// ── Language-aware system prompt factory ─────────────────────────────────────

/**
 * Build the planner system prompt that instructs the LLM to:
 *  - respond in the user's own language
 *  - generate a plan immediately (no clarifying questions)
 *  - state assumptions if the request is ambiguous
 */
export function buildPlannerSystemPrompt(userLang: string): string {
  return `You MUST respond in the user's language. User language: ${userLang}.
Generate a step-by-step plan. Do not ask questions. If ambiguous, make a reasonable assumption and state it.

Return a JSON object with this exact shape:
{
  "appName": "<short app name>",
  "summary": "<one-sentence description>",
  "pages": ["<page1>", "<page2>"],
  "steps": [
    { "id": "think",     "label": "<analysis summary>" },
    { "id": "architect", "label": "<architecture decision>" },
    { "id": "code",      "label": "<main coding tasks>" },
    { "id": "theme",     "label": "<visual style choice>" },
    { "id": "save",      "label": "Saving project" }
  ],
  "assumptions": ["<assumption if any>"]
}

Respond with ONLY valid JSON. No markdown fences, no prose outside the object.`;
}
