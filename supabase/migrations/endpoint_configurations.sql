-- ── Multi-Tenant Architecture — Endpoint Configurations ────────────────────────
-- Migration: endpoint_configurations
-- Purpose: Store per-tenant API credentials for external providers
--          (Meta, Google, Telegram, OpenRouter, Supabase) with rate limiting.

-- ── Tenants ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,         -- URL-safe identifier
  plan        text NOT NULL DEFAULT 'free', -- free | pro | enterprise
  owner_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Attach tenant to existing agent_sessions
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS agent_sessions_tenant_idx ON agent_sessions(tenant_id);

-- ── Endpoint Configurations ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS endpoint_configurations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Provider identity
  provider    text NOT NULL,               -- 'meta' | 'google' | 'telegram' | 'openrouter' | 'anthropic' | 'openai' | 'deepseek'
  label       text,                        -- human-readable name, e.g. "Meta Ads Production"
  is_active   boolean NOT NULL DEFAULT true,

  -- Credentials (stored encrypted at rest via Supabase Vault in production)
  api_key     text,                        -- primary API key / token
  api_secret  text,                        -- OAuth secret or secondary credential
  endpoint_url text,                       -- custom base URL override (optional)
  extra_params jsonb NOT NULL DEFAULT '{}', -- provider-specific params:
  --   meta:     { "app_id": "...", "app_secret": "...", "ad_account_id": "..." }
  --   google:   { "client_id": "...", "project_id": "...", "oauth_token": "..." }
  --   telegram: { "bot_token": "...", "chat_id": "..." }

  -- Rate limiting
  rate_limit_rpm   int NOT NULL DEFAULT 60,   -- requests per minute
  rate_limit_rpd   int NOT NULL DEFAULT 1000, -- requests per day
  rate_limit_burst int NOT NULL DEFAULT 10,   -- burst allowance

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, provider, label)
);

CREATE INDEX IF NOT EXISTS endpoint_conf_tenant_idx    ON endpoint_configurations(tenant_id);
CREATE INDEX IF NOT EXISTS endpoint_conf_provider_idx  ON endpoint_configurations(provider);
CREATE INDEX IF NOT EXISTS endpoint_conf_active_idx    ON endpoint_configurations(tenant_id, is_active);

-- ── Request Log (Rate Limiting + Distribution Tracking) ───────────────────────

CREATE TABLE IF NOT EXISTS endpoint_request_log (
  id              bigserial PRIMARY KEY,
  endpoint_conf_id uuid NOT NULL REFERENCES endpoint_configurations(id) ON DELETE CASCADE,
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  requested_at     timestamptz NOT NULL DEFAULT now(),
  status_code      int,
  latency_ms       int,
  tokens_used      int,         -- for LLM providers
  cost_usd         numeric(12, 6),
  error_message    text
);

-- Partial index for fast rate-limit window queries (last 60 seconds)
CREATE INDEX IF NOT EXISTS req_log_window_idx
  ON endpoint_request_log(endpoint_conf_id, requested_at DESC)
  WHERE requested_at > now() - interval '1 day';

-- ── Rate Limiting Function ────────────────────────────────────────────────────
-- Returns TRUE if the request is allowed, FALSE if limit exceeded.
-- Call before each API request; log the request after.

CREATE OR REPLACE FUNCTION check_rate_limit(p_endpoint_conf_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rpm   int;
  v_rpd   int;
  v_burst int;
  v_count_minute int;
  v_count_day    int;
BEGIN
  -- Load limits
  SELECT rate_limit_rpm, rate_limit_rpd, rate_limit_burst
    INTO v_rpm, v_rpd, v_burst
    FROM endpoint_configurations
   WHERE id = p_endpoint_conf_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN false; -- endpoint not found or inactive
  END IF;

  -- Count requests in last minute
  SELECT COUNT(*) INTO v_count_minute
    FROM endpoint_request_log
   WHERE endpoint_conf_id = p_endpoint_conf_id
     AND requested_at > now() - interval '1 minute';

  -- Count requests today (UTC)
  SELECT COUNT(*) INTO v_count_day
    FROM endpoint_request_log
   WHERE endpoint_conf_id = p_endpoint_conf_id
     AND requested_at > date_trunc('day', now());

  RETURN v_count_minute < v_rpm AND v_count_day < v_rpd;
END;
$$;

-- ── Request Distribution View ─────────────────────────────────────────────────
-- Aggregated stats per endpoint for the last 24 h.

CREATE OR REPLACE VIEW endpoint_distribution_stats AS
SELECT
  ec.tenant_id,
  ec.provider,
  ec.label,
  ec.id AS endpoint_conf_id,
  COUNT(rl.id)                                          AS requests_24h,
  ROUND(AVG(rl.latency_ms))                             AS avg_latency_ms,
  SUM(rl.tokens_used)                                   AS total_tokens_24h,
  ROUND(SUM(rl.cost_usd)::numeric, 4)                   AS total_cost_usd_24h,
  COUNT(*) FILTER (WHERE rl.status_code >= 400)         AS errors_24h,
  MAX(rl.requested_at)                                  AS last_request_at
FROM endpoint_configurations ec
LEFT JOIN endpoint_request_log rl
       ON rl.endpoint_conf_id = ec.id
      AND rl.requested_at > now() - interval '1 day'
GROUP BY ec.tenant_id, ec.provider, ec.label, ec.id;

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE tenants                ENABLE ROW LEVEL SECURITY;
ALTER TABLE endpoint_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE endpoint_request_log    ENABLE ROW LEVEL SECURITY;

-- Tenants: owners see only their own tenant
CREATE POLICY tenants_owner ON tenants
  FOR ALL USING (owner_id = auth.uid());

-- Endpoint configs: users see configs for their tenant only
CREATE POLICY endpoint_conf_tenant ON endpoint_configurations
  FOR ALL USING (
    tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid())
  );

-- Request log: same tenant scoping
CREATE POLICY req_log_tenant ON endpoint_request_log
  FOR ALL USING (
    tenant_id IN (SELECT id FROM tenants WHERE owner_id = auth.uid())
  );

-- ── Auto-update updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER endpoint_conf_updated_at
  BEFORE UPDATE ON endpoint_configurations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
