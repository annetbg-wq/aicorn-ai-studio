# AIC-RG Studio Superadmin MCP

A remote development/staging MCP control surface for `annetbg-wq/aicorn-ai-studio`. It is deployed as Railway service `aicorn-ai-studio-mcp` and is not a public product API.

The MCP exposes a stable 38-tool catalog. Privileged calls are capability-driven: when an MCP-internal credential is absent, the tool remains discoverable but returns an explicit configuration error. ChatGPT may also use separately connected GitHub, Railway, and Supabase connectors; those connections are independent from credentials stored inside this MCP service.

## Authentication

`/mcp` accepts either the static `MCP_BEARER_TOKEN` or an OAuth 2.1 access token issued by this service. ChatGPT uses the OAuth flow with PKCE and dynamic client registration. OAuth client/code/access-token state is signed and restart-safe; refresh-token replay state remains process-local.

Production public URL discovery is Railway-first: `RAILWAY_PUBLIC_DOMAIN` is authoritative. `PUBLIC_BASE_URL` exists for local development or an intentional custom-domain override. Legacy `RENDER_EXTERNAL_URL` remains only as a passive compatibility fallback for old hosting environments; there is no Render API deployment control anymore.

## Runtime capabilities

`GET /health` returns a non-secret capability matrix together with the effective public URL, backend health URL, deployed commit and service name.

Current capability flags:

- `github`: requires `GITHUB_TOKEN`; enables MCP-internal repo/CI and Git-source introspection tools.
- `supabaseApi`: requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; enables diagnostic-run lifecycle tools.
- `supabaseDb`: requires `SUPABASE_DB_URL`; enables direct PostgreSQL schema/query primitives and, with GitHub access, repo-backed migrations.
- `pipelineDiagnostics`: reports whether both GitHub source inspection and Supabase diagnostic lifecycle are internally available. The lifecycle itself only needs `supabaseApi`.
- `railwayDeploy`: requires `RAILWAY_PROJECT_TOKEN` + `RAILWAY_PROJECT_ID` + `RAILWAY_ENVIRONMENT_ID` + `RAILWAY_BACKEND_SERVICE_ID`.
- `railwayRuntime`: reports whether the MCP is actually running with Railway runtime identifiers.

Use a Railway **project token scoped to production**, never an account-wide token. For GitHub, prefer the separately connected GitHub connector; only add a fine-grained repo-scoped `GITHUB_TOKEN` if an MCP-internal action is genuinely necessary.

The exact 38-tool requirement/status table is in `CAPABILITY_MATRIX.md`.

## Active hosting

- Frontend: GitHub Pages
- Backend: Railway `aicorn-ai-studio-backend`
- MCP: Railway `aicorn-ai-studio-mcp`
- Diagnostic/development data: Supabase `AICRG-studio`

`deploy_get_health` is credential-free and checks the active Railway backend plus GitHub Pages. `deploy_trigger_backend`, `deploy_get_backend_status`, `deploy_get_backend_logs`, and `config_list_backend_env_keys` operate on Railway through its GraphQL Public API when `railwayDeploy` is configured.

## Tool families

The stable catalog provides:

- repo read/search/status/diff/log/branch/write/PR/merge operations;
- GitHub Actions CI dispatch/status/log operations;
- Railway backend deploy/status/log/env-name operations plus credential-free live health;
- Supabase schema/query/migration operations;
- generation-pipeline diagnostic-run inspection and controlled step execution.

For general infrastructure administration, ChatGPT should prefer the separately connected GitHub, Railway and Supabase connectors. This avoids duplicating broad secrets inside the MCP solely to reproduce capabilities already available through first-party connectors.

## Interactive pipeline diagnostics

`frontend/src/services/DiagnosticIntercept.ts` intercepts LLM requests only when a browser session has an active `AIC_DIAGNOSTIC_RUN_ID`. The request is persisted in Supabase as a pending diagnostic step, the MCP can inspect/validate/resolve it, and the browser resumes through the real downstream Studio parsing, validation, compile and file-write paths.

The dynamic pipeline lifecycle therefore requires MCP-internal Supabase access even when ChatGPT itself has a separate Supabase connector: the browser and MCP must coordinate through the same diagnostic tables during a live run. The active Supabase project has the `diagnostic_runs` and `diagnostic_run_steps` migration applied.

## Development and validation

```bash
cd mcp-server
npm install
npm run typecheck
npm test
```

The repository CI contains a mandatory `MCP TypeScript + Unit Tests` job. Changes must pass it before merge. After merge, verify Railway deployment, `/health`, OAuth connectivity and `deploy_get_health`.

See `DEPLOYMENT.md` for the canonical remote topology and configuration contract.