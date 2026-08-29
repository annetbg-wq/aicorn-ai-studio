# AIC-RG Studio Superadmin MCP

A remote development/staging MCP control surface for `annetbg-wq/aicorn-ai-studio`. It is deployed as Railway service `aicorn-ai-studio-mcp` and is not a public product API.

The MCP is intentionally capability-driven: it advertises only tool groups for which the Railway service actually has the required internal credentials. ChatGPT may also use separately connected GitHub, Railway, and Supabase connectors; those connections are independent from the credentials stored inside this MCP service.

## Authentication

`/mcp` accepts either the static `MCP_BEARER_TOKEN` or an OAuth 2.1 access token issued by this service. ChatGPT uses the OAuth flow with PKCE and dynamic client registration. OAuth client/code/access-token state is signed and restart-safe; refresh-token replay state remains process-local.

Production public URL discovery is Railway-first: `RAILWAY_PUBLIC_DOMAIN` is authoritative. `PUBLIC_BASE_URL` exists for local development or an intentional custom-domain override. Legacy `RENDER_EXTERNAL_URL` remains only as a compatibility fallback.

## Runtime capabilities

`GET /health` returns a non-secret capability matrix together with the effective public URL, backend health URL, deployed commit and service name.

Current capability flags:

- `github`: requires `GITHUB_TOKEN`; enables repo and CI tool groups.
- `supabaseApi`: requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- `supabaseDb`: requires `SUPABASE_DB_URL`; enables direct PostgreSQL schema/query/migration primitives when combined with GitHub access where repo files are needed.
- `pipelineDiagnostics`: requires both GitHub and Supabase API access because diagnostic execution combines source inspection with diagnostic-run state.
- `renderLegacy`: requires `RENDER_API_KEY`; exposes only the retired Render deploy/log/env controls.
- `railwayRuntime`: reports whether Railway runtime identifiers are present.

Missing credentials do not produce dead tools. The corresponding tools are omitted from MCP discovery rather than advertised and allowed to fail later with `Missing required environment variable`.

## Active hosting

- Frontend: GitHub Pages
- Backend: Railway `aicorn-ai-studio-backend`
- MCP: Railway `aicorn-ai-studio-mcp`
- Diagnostic/development data: Supabase `AICRG-studio`

`deploy_get_health` is always available and checks the active Railway backend plus GitHub Pages without requiring provider credentials. Old Render deployment tools are legacy-only.

## Tool families

When configured, the MCP can provide:

- repo read/search/status/diff/log/branch/write/PR/merge operations;
- GitHub Actions CI dispatch/status/log operations;
- live Studio health checks;
- Supabase schema/query/migration operations;
- generation-pipeline diagnostic-run inspection and controlled step execution.

For infrastructure administration, ChatGPT can additionally use the separately connected GitHub, Railway and Supabase connectors. This avoids forcing duplicate high-privilege secrets into the MCP service solely to reproduce capabilities already available through first-party connectors.

## Interactive pipeline diagnostics

`frontend/src/services/DiagnosticIntercept.ts` intercepts LLM requests only when a browser session has an active `AIC_DIAGNOSTIC_RUN_ID`. The request is persisted in Supabase as a pending diagnostic step, the MCP can inspect/validate/resolve it, and the browser resumes through the real downstream Studio parsing, validation, compile and file-write paths.

The dynamic pipeline tools therefore require MCP-internal Supabase access even when ChatGPT itself has a separate Supabase connector: the browser and MCP must coordinate through the same diagnostic tables during a live run.

## Development and validation

```bash
cd mcp-server
npm install
npm run typecheck
npm test
```

The repository CI contains a mandatory `MCP TypeScript + Unit Tests` job. Changes must pass it before merge. After merge, verify Railway deployment, `/health`, OAuth connectivity and `deploy_get_health`.

See `DEPLOYMENT.md` for the canonical remote topology and configuration contract.
