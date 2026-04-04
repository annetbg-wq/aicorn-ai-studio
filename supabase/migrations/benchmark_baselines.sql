-- benchmark_baselines — stores per-run baseline rows for BenchmarkGate regression detection
-- intent_id = 'ALL' rows are aggregate summaries; individual intent rows have real intent ids.

create table if not exists public.benchmark_baselines (
  id          uuid        primary key default gen_random_uuid(),
  model_id    text        not null,
  run_id      text        not null,
  intent_id   text        not null,   -- 'ALL' for aggregate rows
  outcome     text        not null,   -- BenchmarkOutcome | 'aggregate'
  file_count  int         not null default 0,
  route_count int         not null default 0,
  duration_ms int         not null default 0,
  created_at  timestamptz not null default now()
);

-- Index for fast per-model aggregate lookups (used by BaselineStore.getBaseline)
create index if not exists benchmark_baselines_model_agg_idx
  on public.benchmark_baselines (model_id, intent_id, created_at desc);

-- Index for run-level lookups
create index if not exists benchmark_baselines_run_idx
  on public.benchmark_baselines (run_id);

-- Enable RLS (anon can insert + select their own rows)
alter table public.benchmark_baselines enable row level security;

create policy "anon_select" on public.benchmark_baselines
  for select using (true);

create policy "anon_insert" on public.benchmark_baselines
  for insert with check (true);
