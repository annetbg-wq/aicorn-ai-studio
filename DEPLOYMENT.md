# Remote dev/staging deployment

GitHub stays the source of truth. Two independent, auto-deploying targets:

- **Frontend** (static Vite build) → **GitHub Pages**, deployed by
  [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) on every push to `main`.
  URL: `https://annetbg-wq.github.io/aicorn-ai-studio/`
- **Backend** (Express: sessions, preview compile, project store) → **Render.com** web service,
  defined by [`render.yaml`](render.yaml). Render auto-deploys on every push to `main` once the
  Blueprint is connected (Render dashboard → New → Blueprint → select this repo).
  URL: `https://aicorn-ai-studio-backend.onrender.com`

- **Superadmin MCP** (dev-only remote tools for an external assistant — not a public API) →
  **Render.com** web service `aicorn-ai-studio-mcp`, also defined in [`render.yaml`](render.yaml).
  Same repo, same Blueprint, separate service — own bearer-auth boundary, own (far more powerful)
  credentials. See [`mcp-server/README.md`](mcp-server/README.md) for what it can do.
  URL: `https://aicorn-ai-studio-mcp.onrender.com/mcp`

Neither Studio target requires a local machine to be running. No Docker — all three use native Node
buildpacks.

## One-time setup

1. **Render**: New → Blueprint → connect `annetbg-wq/aicorn-ai-studio` → Render reads `render.yaml`
   and provisions the `aicorn-ai-studio-backend` web service on the free plan.
2. In the Render dashboard, fill in the provider keys you actually use (only the ones you need):
   `AIC_DEV_TOKEN`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`,
   `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`.
   These are marked `sync: false` in `render.yaml` — Render never stores them in git.
3. The same Blueprint sync also adds `aicorn-ai-studio-mcp`. In its Render dashboard, fill in:
   - `MCP_BEARER_TOKEN` — mint your own (e.g. `openssl rand -hex 32`); this is what you'll put in
     the MCP host/connector config, not a credential from anywhere else.
   - `GITHUB_TOKEN` — a **fine-grained PAT scoped to only this repo**
     (github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens →
     Only select repositories → `aicorn-ai-studio`). Repository permissions: Contents (read/write),
     Pull requests (read/write), Actions (read/write), Workflows (read/write). Nothing else — no
     Administration, no org-wide access.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API. The service role key
     bypasses RLS; it's only ever held by this service and is never returned through any MCP tool.
   - `SUPABASE_DB_URL` — Project Settings → Database → Connection string. Only the schema/migration/
     read-only-query tools use this (they need real multi-statement SQL, which the REST/RPC surface
     can't run).
   - `RENDER_API_KEY` — Account Settings → API Keys.
4. GitHub Pages is already enabled (Settings → Pages → Source: GitHub Actions).
5. GitHub Actions secrets/variables (already set for this repo):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (secrets), `VITE_API_URL` (variable, points at the
   Render URL above). `VITE_OPENROUTER_API_KEY` is intentionally **not** set for the public build —
   it would ship a shared key inside a publicly readable JS bundle. Each user configures their own
   provider key via the in-app Settings panel instead (existing behavior, unchanged).

## Required manual step: Supabase Auth redirect URLs

Google sign-in redirects to `http://localhost:3000` after the Pages deploy unless this is done —
**this cannot be fixed from code**, it's a Supabase project setting:

1. Supabase Dashboard → your project → Authentication → URL Configuration.
2. **Site URL**: change from `http://localhost:3000` (or whatever local value is there now) to
   `https://annetbg-wq.github.io/aicorn-ai-studio/`.
3. **Redirect URLs**: add `https://annetbg-wq.github.io/aicorn-ai-studio/` (and keep
   `http://localhost:5183/` for local dev — the app now sends exactly these two values as
   `redirectTo`, nothing else).

Why: `signInWithOAuth`'s `redirectTo` in the app code is correct and dynamic (see
`AuthContext.tsx`) — but Supabase silently ignores any `redirectTo` that isn't on this allow list
and falls back to Site URL instead. If Site URL is still the original local dev default, that's
where every environment ends up regardless of what the app requests.

## Superadmin MCP resource boundary

Everything this service can reach is scoped by which credentials it holds, not by per-tool ACLs:
the GitHub PAT only has access to this one repo, the Supabase service role only reaches this one
project, the Render API key can only see this account's services (Render doesn't offer finer
per-service scoping). It never touches any other product's resources because it is never given
credentials for any other product. Full tool list and how the interactive pipeline execution
primitive works: [`mcp-server/README.md`](mcp-server/README.md).

## Connecting ChatGPT's custom MCP connector

ChatGPT's custom-connector UI only offers OAuth configuration, no field for a static token, so
`aicorn-ai-studio-mcp` speaks OAuth 2.1 for it while keeping `MCP_BEARER_TOKEN` working as-is for
every other caller. **No new Render secret is required for this** — the OAuth `/authorize` login
step re-uses `MCP_BEARER_TOKEN` itself, so there is nothing extra to configure beyond what's already
in the table above. In ChatGPT: add a custom connector pointed at
`https://aicorn-ai-studio-mcp.onrender.com/mcp`; ChatGPT self-registers as an OAuth client and will
prompt for the bearer token on the login screen the first time it connects. Full protocol details:
[`mcp-server/README.md`](mcp-server/README.md#authentication).

## Known limitation: ephemeral backend disk

Render's free plan gives the backend an ephemeral filesystem. `projects-store/` (saved projects) and
`_local_runtime/backend/sessions/` (chat sessions) live on local disk exactly as they do today —
that part of the architecture was intentionally left untouched. On every redeploy (including auto-
deploys triggered by a push to `main`) or dyno restart after idle, **that disk resets and all
projects/sessions saved since the last deploy are lost.** Supabase-backed data (auth, staging
access) is unaffected. Moving `project-store` persistence to Supabase would remove this limitation
but is a separate, later change — see the comment already in `backend/project-store.ts`.

## What changed to make this possible

- Backend now binds to `HOST` (default `127.0.0.1`, set to `0.0.0.0` on Render) and reads `PORT`
  from the environment instead of hardcoding `127.0.0.1:3000`.
- `AIC_ALLOWED_ORIGINS` / `AIC_SERVER_MODE=production` (already-existing CORS + prod-guard code)
  now get exercised for real, pointed at the Pages origin.
- The handful of frontend fetch/iframe calls that assumed the backend was same-origin (proxied by
  Vite locally) now resolve against `VITE_API_URL` when set, exactly like every other backend call
  in this codebase already did.
- `vite.config.ts` takes a `GITHUB_PAGES_BASE` build-time base path for the Pages subpath.

No change to `ProtoPipeline`, `generationPath`, `skeleton_assembly`, `blank_canvas`, `LVPipeline`,
`SimpleGeneration`, manifests, `DesignContract`, generation prompts, or provider/model selection
logic.
