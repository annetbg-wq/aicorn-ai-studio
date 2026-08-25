# Remote dev/staging deployment

GitHub stays the source of truth. Two independent, auto-deploying targets:

- **Frontend** (static Vite build) → **GitHub Pages**, deployed by
  [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) on every push to `main`.
  URL: `https://annetbg-wq.github.io/aicorn-ai-studio/`
- **Backend** (Express: sessions, preview compile, project store) → **Render.com** web service,
  defined by [`render.yaml`](render.yaml). Render auto-deploys on every push to `main` once the
  Blueprint is connected (Render dashboard → New → Blueprint → select this repo).
  URL: `https://aicorn-ai-studio-backend.onrender.com`

Neither target requires a local machine to be running. No Docker — both use native Node buildpacks.

## One-time setup

1. **Render**: New → Blueprint → connect `annetbg-wq/aicorn-ai-studio` → Render reads `render.yaml`
   and provisions the `aicorn-ai-studio-backend` web service on the free plan.
2. In the Render dashboard, fill in the provider keys you actually use (only the ones you need):
   `AIC_DEV_TOKEN`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`,
   `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `MISTRAL_API_KEY`, `GROQ_API_KEY`.
   These are marked `sync: false` in `render.yaml` — Render never stores them in git.
3. GitHub Pages is already enabled (Settings → Pages → Source: GitHub Actions).
4. GitHub Actions secrets/variables (already set for this repo):
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
