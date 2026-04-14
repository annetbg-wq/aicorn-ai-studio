-- shared_snapshots — stores anonymous project snapshots for instant share links.
-- No auth required to read: RLS allows public SELECT by share_id.
-- Snapshots expire after TTL (7 days default) and are cleaned up by the edge function.

create table if not exists shared_snapshots (
  id           uuid primary key default gen_random_uuid(),
  share_id     text unique not null default left(md5(random()::text || clock_timestamp()::text), 12),
  project_id   text,
  title        text,
  -- Compressed snapshot of files (JSON: Record<string, string>)
  files        jsonb not null,
  -- Pre-built HTML entry for single-file apps (optional, for fast iframe embed)
  html_entry   text,
  -- Thumbnail data-URL (base64 JPEG, ≤ 50 KB)
  thumbnail    text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz default now(),
  expires_at   timestamptz default now() + interval '7 days',
  view_count   integer default 0
);

-- Index on share_id for fast /share/:id lookup
create index if not exists idx_shared_snapshots_share_id on shared_snapshots(share_id);

-- Expire-based index for cleanup job
create index if not exists idx_shared_snapshots_expires on shared_snapshots(expires_at);

-- RLS: anyone can read non-expired snapshots; only authenticated users can insert
alter table shared_snapshots enable row level security;

create policy "public read non-expired snapshots"
  on shared_snapshots for select
  using (expires_at > now());

create policy "authenticated users can create snapshots"
  on shared_snapshots for insert
  to authenticated
  with check (true);

-- Allow anon inserts too (studio may not require login for sharing)
create policy "anon users can create snapshots"
  on shared_snapshots for insert
  to anon
  with check (true);
