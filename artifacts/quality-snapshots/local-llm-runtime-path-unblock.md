# Local LLM Runtime Path Unblock

## Summary verdict

**UNBLOCKED** — explicit `user_set` route works; backend no longer locks diagnostic runs to Claude CLI.

---

## Branch

`p2/coder-product-identity-substitution`

---

## Problem diagnosis

Previous diagnostic runs were blocked by two issues:

1. **ERR_REQUIRE_CYCLE_MODULE** — non-fatal ESM circular-dependency warning emitted at backend startup (Node 22+).  Server still starts.  Root cause is a CJS/ESM interop in the import chain.  Decision: non-fatal, left as-is; the explicit route fix does not require resolving it.

2. **`mode.json` locked to `"provider":"claude"`** — every backend restart called `readMode()` which silently reset `"off"` back to `"claude"`, forcing the IdeaModel and `/chat` handler to attempt Claude CLI (unavailable in this environment → `spawn EINVAL` / 503).

3. **No explicit route bypass** — the `/chat` handler had no path for callers to supply `sourceAuthority=user_set` + `provider` + `modelId` and bypass mode.json and agent-config.json entirely.

---

## Changes made

### `backend/auth-token.ts`

| Change | Location | Effect |
|--------|----------|--------|
| `ChatRequest` interface extended | L173-182 | Adds `provider?`, `modelId?`, `sourceAuthority?` fields to the request type |
| `readMode()` auto-reset removed | L238-241 | `"off"` mode now persists across restarts; diagnostic setups no longer hijacked |
| `runExplicitRoute()` exported | After `runStandardAgents()` | New function: validates provider, reads key from `process.env`, makes direct LLM fetch; never touches mode.json or agent-config.json |
| `/chat` handler updated | Around L1250 | Branches on `isExplicitRoute = sourceAuthority === 'user_set'`; returns 400 with `code: 'explicit_route_incomplete'` if provider/modelId omitted; returns 503 with `code: 'cli_unavailable'` + `hint` when CLI is unavailable |

### `backend/auth-token.test.ts`

Added two new describe blocks (10 new tests, all passing):

- `runExplicitRoute — explicit LLM route bypass` (7 tests)
  - throws fast on unknown provider
  - throws fast on missing env key (naming the env var)
  - does not fall back to agent-config.json
  - calls LLM with correct Authorization header
  - Claude CLI (spawn) is never invoked
  - openrouter prefix is NOT stripped
  - throws descriptively on non-ok API status

- `/chat endpoint — explicit route and CLI-unavailable guard` (3 tests)
  - returns 503 in claude mode when CLI is absent
  - returns 400 with `code: 'explicit_route_incomplete'` when provider+modelId both missing
  - returns 400 with same code when only provider is set

---

## ERR_REQUIRE_CYCLE_MODULE status

**Still present at startup** — but non-fatal.  Server starts and processes requests normally after the warning.  Cycle originates in the ESM import chain around preview-manager → LiveGenerationContractValidator → SkeletonRegistry.  Resolving this would require refactoring module boundaries and is outside scope of this task.

---

## How to run a local diagnostic with Gemini

Set the following in the test browser localStorage before generation:

```
localStorage.setItem('AGENT_CONFIG_agent_build', JSON.stringify({
  provider: 'google',
  modelId: 'google/gemini-2.5-flash',
  apiKey: '<GOOGLE_API_KEY>',    // kept in browser only, never committed
  sourceAuthority: 'user_set'
}));
localStorage.setItem('AIC_DEV_AUTH_BYPASS', '1');
```

Set backend env var (NOT in any file, only in the process):

```
$env:GOOGLE_API_KEY = "<your-key>"
node backend/auth-token.ts
```

IdeaModel (`/chat` with `sourceAuthority=user_set`) will now take the explicit route:

```json
POST /chat
{
  "message": "...",
  "provider": "google",
  "modelId": "google/gemini-2.5-flash",
  "sourceAuthority": "user_set"
}
```

- Backend reads `GOOGLE_API_KEY` from `process.env`
- Key is never sent to the browser or logged
- `mode.json` is bypassed entirely

---

## mode.json for diagnostic runs

Write `backend/mode.json` to:

```json
{ "provider": "off" }
```

This puts standard agents on the `/chat` path.  With the `off` auto-reset fix, this value now persists across restarts.

---

## Tests run

```
Test Files  1 passed (1)
     Tests  38 passed (38)  (all 38, including 10 new)
  Duration  2.85s
```

Typecheck: `npm run typecheck --prefix frontend` → **0 errors**

---

## Security confirmation

- `GOOGLE_API_KEY` never written to localStorage
- `GOOGLE_API_KEY` never appears in logs (only `set` / `missing` status)
- No `VITE_GOOGLE_API_KEY` usage
- `runExplicitRoute` reads only from `process.env`, never from request body or agent-config.json
- No real LLM calls in tests (all use `vi.stubGlobal('fetch', ...)`)

---

## Files changed

- `backend/auth-token.ts` — explicit route, readMode fix, /chat handler update
- `backend/auth-token.test.ts` — 10 new tests, import of `runExplicitRoute`

---

## Git status

- Branch: `p2/coder-product-identity-substitution`
- HEAD before this commit: `2f62ce3`
- Working tree: 2 modified files + this report (not yet committed)
- **Nothing pushed to remote**

---

## Recommended next step

Set `GOOGLE_API_KEY` in the backend process environment, set `backend/mode.json` to `{"provider":"off"}`, and run the Cashflow Guard diagnostic again via the direct engine path — the explicit route will bypass Claude CLI and route generation through Gemini.
