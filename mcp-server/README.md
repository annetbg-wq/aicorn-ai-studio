# AIC-RG Studio Superadmin MCP

A remote MCP server that gives an external assistant (e.g. ChatGPT via a custom connector) full
inspect → diagnose → edit → test → repair → deploy → verify capability over **this one repo and its
dev/sandbox infrastructure only** — not a public product API.

Deployed as its own Render service (`aicorn-ai-studio-mcp`), separate from the Studio backend, so it
has its own bearer-auth boundary and its own (much more powerful) credentials. See the repo root
`DEPLOYMENT.md` for exact setup steps and the required environment variable names.

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
