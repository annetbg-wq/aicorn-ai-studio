/**
 * share-snapshot — Supabase Edge Function
 *
 * POST /share-snapshot          { action: 'create', files, title?, thumbnail?, projectId? }
 *   → { ok: true, shareId, shareUrl }
 *
 * GET  /share-snapshot?id=<shareId>
 *   → { ok: true, snapshot: { title, files, thumbnail, createdAt, expiresAt } }
 *
 * POST /share-snapshot          { action: 'cleanup' }   (internal — called by cron or admin)
 *   → { ok: true, deleted: number }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // ── GET: read snapshot by shareId ────────────────────────────────────────
    if (req.method === 'GET') {
      const url    = new URL(req.url);
      const shareId = url.searchParams.get('id');
      if (!shareId) {
        return json({ ok: false, error: 'Missing id parameter' }, 400);
      }

      const { data, error } = await supabase
        .from('shared_snapshots')
        .select('share_id, title, files, thumbnail, created_at, expires_at, view_count')
        .eq('share_id', shareId)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error || !data) {
        return json({ ok: false, error: 'Snapshot not found or expired' }, 404);
      }

      // Bump view count (fire-and-forget)
      void supabase
        .from('shared_snapshots')
        .update({ view_count: (data.view_count ?? 0) + 1 })
        .eq('share_id', shareId);

      return json({
        ok:       true,
        snapshot: {
          title:     data.title,
          files:     data.files,
          thumbnail: data.thumbnail,
          createdAt: data.created_at,
          expiresAt: data.expires_at,
        },
      });
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = await req.json();

      // ── cleanup action ───────────────────────────────────────────────────
      if (body.action === 'cleanup') {
        const { data, error } = await supabase
          .from('shared_snapshots')
          .delete()
          .lt('expires_at', new Date().toISOString())
          .select('id');
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, deleted: data?.length ?? 0 });
      }

      // ── create action ─────────────────────────────────────────────────────
      if (body.action === 'create') {
        const { files, title, thumbnail, projectId } = body as {
          files:      Record<string, string>;
          title?:     string;
          thumbnail?: string;
          projectId?: string;
        };

        if (!files || typeof files !== 'object') {
          return json({ ok: false, error: 'files is required' }, 400);
        }

        // Rough size check — reject if over 1 MB serialized
        const serialized = JSON.stringify(files);
        if (serialized.length > 1_000_000) {
          return json({ ok: false, error: 'Snapshot too large (> 1 MB)' }, 413);
        }

        const { data, error } = await supabase
          .from('shared_snapshots')
          .insert({
            project_id: projectId ?? null,
            title:      title ?? 'Untitled',
            files,
            thumbnail:  thumbnail ?? null,
          })
          .select('share_id')
          .single();

        if (error || !data) {
          return json({ ok: false, error: error?.message ?? 'Insert failed' }, 500);
        }

        const origin   = req.headers.get('origin') ?? '';
        const shareUrl = `${origin}/share/${data.share_id}`;

        return json({ ok: true, shareId: data.share_id, shareUrl });
      }

      return json({ ok: false, error: 'Unknown action' }, 400);
    }

    return json({ ok: false, error: 'Method not allowed' }, 405);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: msg }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
