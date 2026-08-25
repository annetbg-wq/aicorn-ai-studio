# AIC-RG Studio Superadmin MCP

A remote MCP server that gives an external assistant (e.g. ChatGPT via a custom connector) full
inspect → diagnose → edit → test → repair → deploy → verify capability over **this one repo and its
dev/sandbox infrastructure only** — not a public product API.

Deployed as its own Render service (`aicorn-ai-studio-mcp`), separate from the Studio backend, so it
has its own auth boundary and its own (much more powerful) credentials. See the repo root
`DEPLOYMENT.md` for exact setup steps and the required environment variable names.

## Authentication

`/mcp` accepts either credential:

- **`MCP_BEARER_TOKEN`** — the original static token, sent as `Authorization: Bearer <token>`. Still
  works exactly as before, for local dev, `curl`, or any CLI-style caller. No client registration or
  OAuth flow needed.
- **An OAuth 2.1 access token** — for ChatGPT's custom connector UI, which only offers an OAuth
  configuration screen (no field for a static bearer token). This service *is* the OAuth
  authorization server for itself — a small, purpose-built one, not a general-purpose IdP:
  - `GET /.well-known/oauth-protected-resource` (RFC 9728) and
    `GET /.well-known/oauth-authorization-server` (RFC 8414) — discovery metadata. `/mcp` also sends
    `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"` on a 401 so
    an OAuth-only client can find its way to these on its own.
  - `POST /register` (RFC 7591) — dynamic client registration; ChatGPT self-registers here, no manual
    client setup. Public clients only (no client secret — PKCE carries the security instead).
  - `GET/POST /authorize` — PKCE (S256) required. `GET` renders a plain login form; the only thing it
    asks for is `MCP_BEARER_TOKEN` itself. **The OAuth layer doesn't add a second, independently
    weaker credential — it's a protocol-shaped wrapper around the one credential that already exists.**
    Only redirects back to the client once both `client_id` and `redirect_uri` are confirmed
    registered (no open redirect); rate-limited per IP as a backstop against brute-forcing the token
    through the form (the token itself is a long random secret, so this is defense in depth, not the
    primary protection).
  - `POST /token` — authorization_code (with PKCE verification) and refresh_token grants. Access
    tokens live 1 hour; refresh tokens rotate on every use (the old one stops working the instant a
    new one is issued).

All OAuth state (registered clients, auth codes, access/refresh tokens) is **in-memory, not
persisted** — this is one free-tier Render instance for one admin's own tools; losing sessions on a
redeploy/restart just means reconnecting the ChatGPT connector once. No new Render secret is required
for OAuth — the login step re-uses `MCP_BEARER_TOKEN`. The one new env var, `PUBLIC_BASE_URL`, is
optional and auto-derived from Render's own `RENDER_EXTERNAL_URL` in production; it only needs
setting for local development against a non-`localhost` callback.

## What it can do

- **Repo**: read files, search code, git status/diff/log, create branches, write+commit+push files,
  open/read/list/merge PRs, delete branches.
- **CI**: dispatch the build/typecheck/test workflow for a branch, poll its status, fetch job logs.
- **Deploy**: trigger a Render backend deploy, read deploy history/logs, read GitHub Pages deploy
  status, check live health of both, list backend env var *names* (never values).
- **Supabase (dev/sandbox project)**: read table schema, list migration files, run a migration that
  already exists as a committed file under `supabase/migrations/` (no inline SQL accepted — see
  `supabaseAdmin.ts` for why), run read-only `SELECT` diagnostics.
- **Generation pipeline diagnostics**: list the pipeline's actual stage identifiers and eval/trend
  fixtures, create/stop a diagnostic run, get its state, get the next paused step's exact captured
  LLM input, submit/validate/commit a result for that step so the real downstream Studio code
  processes it, get artifacts/errors, compare two runs, find their first divergence.

## How the interactive pipeline execution actually works

`frontend/src/services/DiagnosticIntercept.ts` is the entire footprint on the generation pipeline —
`LLMProxy.llmFetch`/`llmFetchStream` call it first. When a diagnostic run is active for a browser
session (`sessionStorage.AIC_DIAGNOSTIC_RUN_ID`), the real LLM call is paused instead of sent: it's
recorded as a pending row in `diagnostic_run_steps` (Supabase) and the call waits. This service reads
that row, lets the external executor produce a result, writes it back, and the browser call resumes
with it as if it were a real LLM response — so every existing downstream code path (parsing,
validators, compile, file writes) runs unmodified.

## Local development

```bash
cd mcp-server
npm install
cp .env.example .env   # fill in real values, this file is gitignored
npm run dev
```

`npm run typecheck` / `npm test` before pushing.
