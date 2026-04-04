-- AIC-RG Studio — Tool Backup Table
-- Run this once in your Supabase SQL Editor:
-- https://supabase.com/dashboard → SQL Editor → New query

create table if not exists tool_backups (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null    default now(),
  comment     text        not null    default '',
  source_code jsonb       not null
);

-- Index for fast lookup by date (most recent first)
create index if not exists tool_backups_created_at_idx
  on tool_backups (created_at desc);

-- Optional: auto-delete backups older than 90 days
-- (uncomment if you want automatic cleanup)
-- create extension if not exists pg_cron;
-- select cron.schedule('cleanup-tool-backups', '0 3 * * *',
--   $$delete from tool_backups where created_at < now() - interval '90 days'$$);

-- Row Level Security: allow anon key to insert and select
alter table tool_backups enable row level security;

create policy "anon can insert" on tool_backups
  for insert to anon with check (true);

create policy "anon can select" on tool_backups
  for select to anon using (true);
