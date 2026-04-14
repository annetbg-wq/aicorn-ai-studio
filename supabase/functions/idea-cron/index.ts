/**
 * idea-cron — Supabase Edge Function
 *
 * Generates idea batches and caches them in the idea_feed_cache table.
 * Designed to be called by pg_cron or manually via POST.
 *
 * POST /idea-cron   { type: 'hot' | 'niches' | 'all', apiKey?: string, model?: string }
 *   → { ok: true, generated: { hot?: number, niches?: number }, cached: boolean }
 *
 * Schedule (pg_cron):
 *   hot ideas   — every day at 04:00 UTC
 *   niche ideas — every Monday at 03:00 UTC
 *
 * Example pg_cron setup (run in SQL editor):
 *   SELECT cron.schedule('idea-hot-daily',   '0 4 * * *',   $$SELECT net.http_post(url:=..., body:=...) $$);
 *   SELECT cron.schedule('idea-niches-weekly','0 3 * * 1',   $$SELECT net.http_post(url:=..., body:=...) $$);
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_MODEL = 'google/gemini-flash-1.5';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function getISOWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

const HOT_PROMPT = `You are a startup idea generator. Generate 3 trending app ideas for today.
For each idea output a JSON object with exactly these fields:
{
  "id": "<uuid>",
  "appName": "<product name>",
  "description": "<one sentence value proposition>",
  "theme": "dark-slate|trust|warm|neon|bloom",
  "targetUser": "<specific persona>",
  "marketContext": "<why this is trending now>",
  "targetAudience": "<target segment>",
  "painPoint": "<specific pain>",
  "competitorGap": "",
  "generatedAt": "<ISO timestamp>",
  "icons": ["<emoji>"],
  "productStrategy": {
    "coreAction": "<the one thing>",
    "retentionLoop": "<why users return>",
    "businessModel": "freemium",
    "paywall": { "needed": false, "trigger": "", "lockedFeature": "", "upgradeMessage": "" }
  },
  "userJourney": { "onboarding": { "needed": false, "reason": "", "steps": [] } },
  "mvpFeatures": ["<feature 1>", "<feature 2>", "<feature 3>"],
  "techStack": { "frontend": "React", "backend": "Supabase", "ai": "", "payments": "" },
  "pages": []
}

Respond with ONLY a JSON array of 3 objects, no markdown.`;

const NICHES_PROMPT = `You are a market analyst. Generate 3 underserved niche app ideas for this week.
Focus on: B2B tools, vertical SaaS, micro-communities, productivity for specific professions.
Each idea must have a "competitorGap" explaining why existing solutions fail.

Output the same JSON schema as hot ideas but with non-empty competitorGap fields.
Respond with ONLY a JSON array of 3 objects, no markdown.`;

async function callLLM(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<unknown[]> {
  const resp = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://aicstudio.app',
      'X-Title': 'AIC Studio idea-cron',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      max_tokens: 4096,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`LLM error ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '[]';

  // Strip markdown code fences if present
  const clean = content.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  try {
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) return [];
    // Ensure each idea has a generated timestamp
    return parsed.map((idea: Record<string, unknown>) => ({
      ...idea,
      generatedAt: idea.generatedAt ?? new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { type?: string; apiKey?: string; model?: string } = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const apiKey = body.apiKey ?? Deno.env.get('OPENROUTER_API_KEY') ?? '';
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'No API key. Pass apiKey or set OPENROUTER_API_KEY secret.' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const model    = body.model ?? DEFAULT_MODEL;
  const feedType = body.type  ?? 'all';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const result: { hot?: number; niches?: number } = {};
  const now = new Date();

  try {
    if (feedType === 'hot' || feedType === 'all') {
      const dateKey = getTodayKey();
      // Skip if already cached today
      const { data: existing } = await supabase
        .from('idea_feed_cache')
        .select('id')
        .eq('feed_type', 'hot')
        .eq('date_key', dateKey)
        .maybeSingle();

      if (!existing) {
        const ideas = await callLLM(HOT_PROMPT, apiKey, model);
        if (ideas.length > 0) {
          await supabase.from('idea_feed_cache').insert({
            feed_type:  'hot',
            date_key:   dateKey,
            ideas:      ideas,
            model_used: model,
            expires_at: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          });
          result.hot = ideas.length;
        }
      } else {
        result.hot = 0; // already cached
      }
    }

    if (feedType === 'niches' || feedType === 'all') {
      const weekKey = getISOWeek(now);
      const { data: existing } = await supabase
        .from('idea_feed_cache')
        .select('id')
        .eq('feed_type', 'niches')
        .eq('week_key', weekKey)
        .maybeSingle();

      if (!existing) {
        const ideas = await callLLM(NICHES_PROMPT, apiKey, model);
        if (ideas.length > 0) {
          await supabase.from('idea_feed_cache').insert({
            feed_type:  'niches',
            week_key:   weekKey,
            ideas:      ideas,
            model_used: model,
            expires_at: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
          });
          result.niches = ideas.length;
        }
      } else {
        result.niches = 0;
      }
    }

    // Cleanup expired rows
    await supabase.rpc('cleanup_expired_idea_feed').maybeSingle();

    return new Response(JSON.stringify({ ok: true, generated: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
