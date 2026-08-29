# Remote dev/staging deployment

GitHub is the source of truth. The active remote topology is:

- **Frontend** → GitHub Pages, deployed by `.github/workflows/deploy-pages.yml` from `main`.
  URL: `https://annetbg-wq.github.io/aicorn-ai-studio/`
- **Backend** → Railway service `aicorn-ai-studio-backend`.
  URL: `https://aicorn-ai-studio-backend-production.up.railway.app`
- **Superadmin MCP** → Railway service `aicorn-ai-studio-mcp`.
  URL: `https://aicorn-ai-studio-mcp-production.up.railway.app/mcp`
- **Development data/diagnostics** → Supabase project `AICRG-studio`.

Render configuration remains in the repository only as legacy migration history/fallback. It is not the active Studio backend hosting target.

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
- healthcheck: `/health`
- OAuth public origin is derived from Railway's `RAILWAY_PUBLIC_DOMAIN`
- `BACKEND_HEALTH_URL` may be set explicitly, but the service can derive/fallback to the Railway backend URL

The MCP always needs `MCP_BEARER_TOKEN` for its own authentication. Privileged tool groups are capability-driven:

- `GITHUB_TOKEN` enables MCP-internal repo/CI tools.
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` enable MCP-internal Supabase API / diagnostic-run access.
- `SUPABASE_DB_URL` enables direct schema/query/migration primitives.
- `RENDER_API_KEY` is legacy-only; when absent, old Render deploy/log/env tools are not registered.

ChatGPT also has separately connected GitHub, Railway, and Supabase connectors. Those connections are independent of the credentials stored inside the MCP Railway service and can be used for infrastructure operations even when the corresponding MCP-internal capability is disabled.

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

The service intentionally does not pretend that an unavailable credential exists. Tool groups that require missing internal credentials are omitted from MCP discovery instead of being advertised and then failing with `Missing required environment variable` at execution time.

## Persistence note

The backend still has filesystem-backed project/session paths. Railway container filesystems are not a durable application datastore across replacement/redeploy scenarios. Supabase-backed state is durable; moving remaining project/session persistence to a durable datastore is a separate architecture task.

## Validation contract

Changes to the MCP must pass the mandatory `MCP TypeScript + Unit Tests` GitHub Actions job in addition to the existing frontend/build/preview/benchmark jobs. After merge, verify the Railway deployment and run the live MCP health smoke test.
