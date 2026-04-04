-- AIC-RG Studio — Immortal Storage Tables
-- Run this once in Supabase SQL Editor:
-- https://supabase.com/dashboard → SQL Editor → New query

-- ── STUDIO MANIFEST ───────────────────────────────────────────────────────────
-- Singleton row: global studio stats (billing, health, infra).
-- id is always 'studio-default'.

create table if not exists studio_manifest (
  id                    text        primary key,
  api_spent             numeric     not null default 0,          -- total $ spent
  context_health        numeric     not null default 100,        -- 0–100 %
  infrastructure_status jsonb       not null default '{}',
  updated_at            timestamptz not null default now()
);

-- RLS: anon can read + upsert (single shared manifest)
alter table studio_manifest enable row level security;

create policy "anon can read manifest"
  on studio_manifest for select to anon using (true);

create policy "anon can insert manifest"
  on studio_manifest for insert to anon with check (true);

create policy "anon can update manifest"
  on studio_manifest for update to anon using (true);

-- Seed the singleton row so the first upsert always succeeds
insert into studio_manifest (id, api_spent, context_health, infrastructure_status)
  values ('studio-default', 0, 100, '{}')
  on conflict (id) do nothing;


-- ── USER PROJECTS ─────────────────────────────────────────────────────────────
-- One row per project, keyed by the local project ID.
-- code_snapshot stores the full FileMap as JSONB.

create table if not exists user_projects (
  id            text        primary key,          -- matches CURRENT_PROJECT_ID
  name          text        not null default '',
  code_snapshot jsonb       not null default '{}',
  last_sync_at  timestamptz not null default now(),
  version       integer     not null default 1
);

-- Fast descending lookup by sync time
create index if not exists user_projects_last_sync_idx
  on user_projects (last_sync_at desc);

-- RLS: anon can read + upsert
alter table user_projects enable row level security;

create policy "anon can read projects"
  on user_projects for select to anon using (true);

create policy "anon can insert projects"
  on user_projects for insert to anon with check (true);

create policy "anon can update projects"
  on user_projects for update to anon using (true);
