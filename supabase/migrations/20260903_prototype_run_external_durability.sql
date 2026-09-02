-- Step 8 external durability schema for AIC RG Studio prototype runs.
-- The backend_auth row is provisioned separately with SHA-256(AIC_PROTOTYPE_BACKEND_SECRET).
-- Never commit the raw backend secret.

create extension if not exists pgcrypto;
create schema if not exists aic_prototype;
revoke all on schema aic_prototype from public, anon, authenticated;

create table if not exists aic_prototype.backend_auth (
  id smallint primary key default 1 check (id = 1),
  secret_hash text not null check (secret_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now()
);

create table if not exists aic_prototype.preview_bindings (
  build_id text primary key check (build_id ~ '^[A-Za-z0-9_-]{8,}$'),
  session_token text not null check (char_length(session_token) between 16 and 200),
  session_fingerprint text not null check (session_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists aic_prototype.build_artifacts (
  build_id text primary key references aic_prototype.preview_bindings(build_id) on delete cascade,
  artifact_status text not null default 'uploading' check (artifact_status in ('uploading','ready','failed')),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  chunk_count integer check (chunk_count is null or chunk_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists aic_prototype.build_artifact_chunks (
  build_id text not null references aic_prototype.build_artifacts(build_id) on delete cascade,
  ordinal integer not null check (ordinal >= 0),
  payload_base64 text not null,
  created_at timestamptz not null default now(),
  primary key (build_id, ordinal)
);

create table if not exists aic_prototype.prototype_runs (
  run_id text primary key check (run_id ~ '^[A-Za-z0-9_-]{8,}$'),
  build_id text not null unique references aic_prototype.preview_bindings(build_id) on delete cascade,
  api_mode text not null check (api_mode in ('mock','staging')),
  skeleton_id text not null check (char_length(trim(skeleton_id)) > 0),
  kind text not null check (kind in ('reference','generation','fixture')),
  retention text not null check (retention in ('rolling','pinned')),
  status text not null check (status in ('compiling','ready','qa_running','qa_failed','failed')),
  preview_path text not null,
  session_fingerprint text not null check (session_fingerprint ~ '^[a-f0-9]{64}$'),
  qa_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function aic_prototype.require_backend_secret(p_secret text)
returns void language plpgsql security definer
set search_path = aic_prototype, public, extensions, pg_temp
as $$
declare v_hash text;
begin
  select secret_hash into v_hash from aic_prototype.backend_auth where id = 1;
  if v_hash is null or encode(extensions.digest(coalesce(p_secret, ''), 'sha256'::text), 'hex') <> v_hash then
    raise exception 'invalid backend credential' using errcode = '42501';
  end if;
end;
$$;
revoke all on function aic_prototype.require_backend_secret(text) from public, anon, authenticated;

create or replace function public.aic_prototype_begin_artifact(p_secret text, p_build_id text, p_session_token text, p_session_fingerprint text)
returns boolean language plpgsql security definer set search_path = aic_prototype, public, pg_temp as $$
declare v_existing_token text;
begin
  perform aic_prototype.require_backend_secret(p_secret);
  if p_build_id !~ '^[A-Za-z0-9_-]{8,}$' then raise exception 'invalid build id'; end if;
  if char_length(coalesce(p_session_token, '')) not between 16 and 200 then raise exception 'invalid session token'; end if;
  if p_session_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'invalid session fingerprint'; end if;
  select session_token into v_existing_token from aic_prototype.preview_bindings where build_id = p_build_id;
  if v_existing_token is not null and v_existing_token <> p_session_token then
    raise exception 'prototype build is already bound to another session' using errcode = '23505';
  end if;
  insert into aic_prototype.preview_bindings(build_id, session_token, session_fingerprint)
  values (p_build_id, p_session_token, p_session_fingerprint)
  on conflict (build_id) do update set session_fingerprint=excluded.session_fingerprint, updated_at=now();
  insert into aic_prototype.build_artifacts(build_id, artifact_status)
  values (p_build_id, 'uploading')
  on conflict (build_id) do update set artifact_status='uploading', sha256=null, size_bytes=null, chunk_count=null, updated_at=now();
  delete from aic_prototype.build_artifact_chunks where build_id=p_build_id;
  return true;
end; $$;

create or replace function public.aic_prototype_put_artifact_chunk(p_secret text, p_build_id text, p_ordinal integer, p_payload_base64 text)
returns boolean language plpgsql security definer set search_path = aic_prototype, public, pg_temp as $$
begin
  perform aic_prototype.require_backend_secret(p_secret);
  if p_ordinal < 0 or char_length(coalesce(p_payload_base64,''))=0 then raise exception 'invalid artifact chunk'; end if;
  insert into aic_prototype.build_artifact_chunks(build_id, ordinal, payload_base64)
  values (p_build_id, p_ordinal, p_payload_base64)
  on conflict (build_id, ordinal) do update set payload_base64=excluded.payload_base64;
  update aic_prototype.build_artifacts set updated_at=now() where build_id=p_build_id;
  return true;
end; $$;

create or replace function public.aic_prototype_finalize_artifact(p_secret text, p_build_id text, p_sha256 text, p_size_bytes bigint, p_chunk_count integer)
returns boolean language plpgsql security definer set search_path = aic_prototype, public, pg_temp as $$
declare v_count integer;
begin
  perform aic_prototype.require_backend_secret(p_secret);
  if p_sha256 !~ '^[a-f0-9]{64}$' or p_size_bytes < 0 or p_chunk_count < 1 then raise exception 'invalid artifact metadata'; end if;
  select count(*) into v_count from aic_prototype.build_artifact_chunks where build_id=p_build_id;
  if v_count <> p_chunk_count then raise exception 'artifact chunk count mismatch'; end if;
  update aic_prototype.build_artifacts set artifact_status='ready', sha256=p_sha256, size_bytes=p_size_bytes, chunk_count=p_chunk_count, updated_at=now() where build_id=p_build_id;
  if not found then raise exception 'artifact not found'; end if;
  return true;
end; $$;

create or replace function public.aic_prototype_get_artifact_manifest(p_secret text, p_build_id text)
returns jsonb language plpgsql security definer set search_path = aic_prototype, public, pg_temp as $$
declare v_result jsonb;
begin
  perform aic_prototype.require_backend_secret(p_secret);
  select jsonb_build_object('buildId',b.build_id,'sessionToken',b.session_token,'sessionFingerprint',b.session_fingerprint,'artifactStatus',a.artifact_status,'sha256',a.sha256,'sizeBytes',a.size_bytes,'chunkCount',a.chunk_count,'updatedAt',greatest(b.updated_at,a.updated_at))
  into v_result from aic_prototype.preview_bindings b join aic_prototype.build_artifacts a on a.build_id=b.build_id where b.build_id=p_build_id;
  return v_result;
end; $$;

create or replace function public.aic_prototype_get_artifact_chunk(p_secret text, p_build_id text, p_ordinal integer)
returns text language plpgsql security definer set search_path = aic_prototype, public, pg_temp as $$
declare v_payload text;
begin
  perform aic_prototype.require_backend_secret(p_secret);
  select payload_base64 into v_payload from aic_prototype.build_artifact_chunks where build_id=p_build_id and ordinal=p_ordinal;
  return v_payload;
end; $$;

create or replace function public.aic_prototype_upsert_run(p_secret text, p_run jsonb)
returns jsonb language plpgsql security definer set search_path = aic_prototype, public, pg_temp as $$
declare
  v_run_id text := p_run->>'runId'; v_build_id text := p_run->>'buildId'; v_record jsonb; v_doomed record; v_pinned_count integer;
begin
  perform aic_prototype.require_backend_secret(p_secret);
  if v_run_id is null or v_run_id <> v_build_id then raise exception 'runId must equal buildId'; end if;
  insert into aic_prototype.prototype_runs(run_id,build_id,api_mode,skeleton_id,kind,retention,status,preview_path,session_fingerprint,qa_summary,created_at,updated_at)
  values(v_run_id,v_build_id,p_run->>'apiMode',p_run->>'skeletonId',coalesce(p_run->>'kind','generation'),coalesce(p_run->>'retention','rolling'),p_run->>'status',coalesce(p_run->>'previewPath','/preview/'||v_build_id||'/'),p_run->>'sessionFingerprint',p_run->'qaSummary',coalesce((p_run->>'createdAt')::timestamptz,now()),now())
  on conflict(run_id) do update set api_mode=excluded.api_mode,skeleton_id=excluded.skeleton_id,kind=excluded.kind,retention=excluded.retention,status=excluded.status,preview_path=excluded.preview_path,session_fingerprint=excluded.session_fingerprint,qa_summary=excluded.qa_summary,updated_at=now();
  select count(*) into v_pinned_count from aic_prototype.prototype_runs where retention='pinned';
  if v_pinned_count > 10 then raise exception 'cannot pin more than 10 prototype runs'; end if;
  for v_doomed in select run_id,build_id from aic_prototype.prototype_runs where retention='rolling' order by updated_at desc offset 10 loop
    delete from aic_prototype.preview_bindings where build_id=v_doomed.build_id;
  end loop;
  delete from aic_prototype.preview_bindings b where b.updated_at < now()-interval '24 hours' and not exists(select 1 from aic_prototype.prototype_runs r where r.build_id=b.build_id);
  select jsonb_build_object('schemaVersion',1,'runId',r.run_id,'buildId',r.build_id,'apiMode',r.api_mode,'skeletonId',r.skeleton_id,'kind',r.kind,'retention',r.retention,'status',r.status,'previewPath',r.preview_path,'sessionFingerprint',r.session_fingerprint,'createdAt',r.created_at,'updatedAt',r.updated_at,'qaSummary',r.qa_summary) into v_record from aic_prototype.prototype_runs r where r.run_id=v_run_id;
  return v_record;
end; $$;

create or replace function public.aic_prototype_get_run(p_secret text, p_run_id text)
returns jsonb language plpgsql security definer set search_path = aic_prototype, public, pg_temp as $$
declare v_record jsonb;
begin
  perform aic_prototype.require_backend_secret(p_secret);
  select jsonb_build_object('schemaVersion',1,'runId',r.run_id,'buildId',r.build_id,'apiMode',r.api_mode,'skeletonId',r.skeleton_id,'kind',r.kind,'retention',r.retention,'status',r.status,'previewPath',r.preview_path,'sessionFingerprint',r.session_fingerprint,'createdAt',r.created_at,'updatedAt',r.updated_at,'qaSummary',r.qa_summary) into v_record from aic_prototype.prototype_runs r where r.run_id=p_run_id;
  return v_record;
end; $$;

create or replace function public.aic_prototype_list_runs(p_secret text)
returns jsonb language plpgsql security definer set search_path = aic_prototype, public, pg_temp as $$
declare v_records jsonb;
begin
  perform aic_prototype.require_backend_secret(p_secret);
  select coalesce(jsonb_agg(jsonb_build_object('schemaVersion',1,'runId',r.run_id,'buildId',r.build_id,'apiMode',r.api_mode,'skeletonId',r.skeleton_id,'kind',r.kind,'retention',r.retention,'status',r.status,'previewPath',r.preview_path,'sessionFingerprint',r.session_fingerprint,'createdAt',r.created_at,'updatedAt',r.updated_at,'qaSummary',r.qa_summary) order by r.updated_at desc),'[]'::jsonb) into v_records from aic_prototype.prototype_runs r;
  return v_records;
end; $$;

create or replace function public.aic_prototype_health(p_secret text)
returns jsonb language plpgsql security definer set search_path = aic_prototype, public, pg_temp as $$
begin perform aic_prototype.require_backend_secret(p_secret); return jsonb_build_object('ok',true,'schemaVersion',1,'checkedAt',now()); end; $$;

revoke all on function public.aic_prototype_begin_artifact(text,text,text,text) from public, authenticated;
revoke all on function public.aic_prototype_put_artifact_chunk(text,text,integer,text) from public, authenticated;
revoke all on function public.aic_prototype_finalize_artifact(text,text,text,bigint,integer) from public, authenticated;
revoke all on function public.aic_prototype_get_artifact_manifest(text,text) from public, authenticated;
revoke all on function public.aic_prototype_get_artifact_chunk(text,text,integer) from public, authenticated;
revoke all on function public.aic_prototype_upsert_run(text,jsonb) from public, authenticated;
revoke all on function public.aic_prototype_get_run(text,text) from public, authenticated;
revoke all on function public.aic_prototype_list_runs(text) from public, authenticated;
revoke all on function public.aic_prototype_health(text) from public, authenticated;

grant execute on function public.aic_prototype_begin_artifact(text,text,text,text) to anon;
grant execute on function public.aic_prototype_put_artifact_chunk(text,text,integer,text) to anon;
grant execute on function public.aic_prototype_finalize_artifact(text,text,text,bigint,integer) to anon;
grant execute on function public.aic_prototype_get_artifact_manifest(text,text) to anon;
grant execute on function public.aic_prototype_get_artifact_chunk(text,text,integer) to anon;
grant execute on function public.aic_prototype_upsert_run(text,jsonb) to anon;
grant execute on function public.aic_prototype_get_run(text,text) to anon;
grant execute on function public.aic_prototype_list_runs(text) to anon;
grant execute on function public.aic_prototype_health(text) to anon;
