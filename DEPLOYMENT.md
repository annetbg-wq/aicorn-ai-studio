# Remote dev/staging deployment

GitHub is the source of truth. The active remote topology is:

- **Frontend** → GitHub Pages, deployed by `.github/workflows/deploy-pages.yml` from `main`.
  URL: `https://annetbg-wq.github.io/aicorn-ai-studio/`
- **Backend** → Railway service `aicorn-ai-studio-backend`.
  URL: `https://aicorn-ai-studio-backend-production.up.railway.app`
- **Superadmin MCP** → Railway service `aicorn-ai-studio-mcp`.
  URL: `https://aicorn-ai-studio-mcp-production.up.railway.app/mcp`
- **Development data/diagnostics** → Supabase project `AICRG-studio`.

There is no active Render deployment contract. The old `render.yaml` blueprint and Render API client were removed after migration to Railway. `RENDER_EXTERNAL_URL` is recognized only as a passive public-base-url fallback when old deployments are run; it is not a deployment control path and requires no Render API key.

Neither Studio service requires a local machine or Docker. Railway uses native Node builds from the same GitHub repository.

## Railway services

### `aicorn-ai-studio-backend`

Source: `annetbg-wq/aicorn-ai-studio`, branch `main`.

- build: `npm ci`
- start: `npx tsx backend/auth-token.ts`
- healthcheck: `/health`
- required runtime configuration includes `HOST`, `AIC_ALLOWED_ORIGINS`, and `AIC_SERVER_MODE`
- provider/model credentials are configured only when needed; no provider/model is committed as a product default

### `aicorn-ai-studio-mcp`

Source: the same repo/branch.

- build: `npm --prefix mcp-server install && npm --prefix mcp-server run build --if-present`
- start: `cd mcp-server && npm start`, which resolves to `tsx src/index.ts`
- healthcheck: `/health`
- OAuth public origin is derived from Railway's `RAILWAY_PUBLIC_DOMAIN`
- `BACKEND_HEALTH_URL` may be set explicitly, but the service can derive/fallback to the Railway backend URL

The MCP always needs `MCP_BEARER_TOKEN` for its own authentication. The 38-tool catalog is stable; privileged calls fail with an explicit capability error when their MCP-internal credential is absent. Capability requirements are documented in `mcp-server/CAPABILITY_MATRIX.md`.

- `GITHUB_TOKEN` enables MCP-internal repo/CI and Git-source introspection tools. Prefer the separately connected GitHub connector unless an internal token is actually required; if added, it must be fine-grained and scoped to this repository only.
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` enable MCP-internal diagnostic-run lifecycle access.
- `SUPABASE_DB_URL` enables direct schema/query/migration primitives.
- `RAILWAY_PROJECT_TOKEN` + Railway project/environment IDs + `RAILWAY_BACKEND_SERVICE_ID` enable MCP-internal Railway deploy/status/log/env-key tools. Use a project token scoped to the production environment, never an account-wide token.

ChatGPT also has separately connected GitHub, Railway, and Supabase connectors. Those connections are independent of credentials stored inside the MCP Railway service and are the preferred path for general infrastructure administration.

`GET /health` is the canonical self-diagnostic endpoint. It reports the effective public URL, backend health URL, deployed commit/service, and a boolean capability matrix without exposing secret values.

## GitHub Pages

GitHub Pages remains the frontend target. GitHub Actions variables/secrets used by the public build must never expose shared provider API keys in the browser bundle. Each user configures provider credentials through the product's existing settings flow.

## Supabase Auth redirect URLs

For hosted authentication, Supabase Authentication → URL Configuration must allow:

- Site URL: `https://annetbg-wq.github.io/aicorn-ai-studio/`
- Redirect URL: `https://annetbg-wq.github.io/aicorn-ai-studio/`

Keep local development redirect URLs only when local development is intentionally needed.

## Superadmin MCP boundary

The MCP is a development/staging control surface, not a public product API. It is scoped to this Studio repository and this Studio infrastructure. Destructive operations remain explicit and auditable.

The service intentionally does not pretend that an unavailable credential exists. Tools remain discoverable for schema stability, but each privileged call reports the exact missing MCP-internal capability instead of failing ambiguously or implying that the ChatGPT connector itself is disconnected.

## Persistence note

The backend still has filesystem-backed project/session paths. Railway container filesystems are not a durable application datastore across replacement/redeploy scenarios. Supabase-backed state is durable; moving remaining project/session persistence to a durable datastore is a separate architecture task.

## Validation contract

Changes to the MCP must pass the mandatory `MCP TypeScript + Unit Tests` GitHub Actions job in addition to the existing frontend/build/preview/benchmark jobs. After merge, verify the Railway deployment and run the live MCP health smoke test.
