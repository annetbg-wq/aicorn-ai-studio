/**
 * cleanup-agent-sessions — Supabase Edge Function
 *
 * Moves sessions stuck in 'building' for > STALL_MINUTES to 'failed'.
 * Also deletes expired shared_snapshots.
 *
 * Triggered by:
 *   - Supabase cron schedule (every 10 minutes)
 *   - Manual POST from admin UI / AgentLabPanel
 *
 * POST /cleanup-agent-sessions  { stall_minutes?: number }
 * → { ok: true, stalledArchived: number, snapshotsDeleted: number }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_STALL_MINUTES = 30;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true }, 200, corsHeaders);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    let stallMinutes = DEFAULT_STALL_MINUTES;
    if (req.method === 'POST') {
      try {
        const body = await req.json().catch(() => ({})) as { stall_minutes?: number };
        if (typeof body.stall_minutes === 'number') stallMinutes = body.stall_minutes;
      } catch { /* ignore parse errors */ }
    }

    const stallCutoff = new Date(Date.now() - stallMinutes * 60 * 1000).toISOString();

    // ── 1. Archive stalled building sessions ─────────────────────────────────
    const { data: stalled } = await supabase
      .from('agent_sessions')
      .select('id')
      .eq('status', 'building')
      .lt('updated_at', stallCutoff);

    let stalledArchived = 0;
    if (stalled?.length) {
      const ids = (stalled as { id: string }[]).map(s => s.id);
      await supabase
        .from('agent_sessions')
        .update({
          status:        'failed',
          review_report: JSON.stringify({ reason: 'stalled_timeout', stall_minutes: stallMinutes }),
          updated_at:    new Date().toISOString(),
        })
        .in('id', ids);
      stalledArchived = ids.length;
    }

    // ── 2. Delete expired shared_snapshots ───────────────────────────────────
    const { data: deletedSnaps } = await supabase
      .from('shared_snapshots')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    const snapshotsDeleted = deletedSnaps?.length ?? 0;

    console.info(`[cleanup] stalledArchived=${stalledArchived} snapshotsDeleted=${snapshotsDeleted}`);

    return json({ ok: true, stalledArchived, snapshotsDeleted }, 200, corsHeaders);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: msg }, 500, corsHeaders);
  }
});

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'content-type': 'application/json' },
  });
}
