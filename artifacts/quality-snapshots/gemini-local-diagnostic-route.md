# Gemini Local Diagnostic Route

**Branch:** `p2/coder-product-identity-substitution`  
**Date:** 2026-05-27  
**Task:** Prepare local-only Google/Gemini API key route for agent diagnostic runs  

---

## Summary

Google/Gemini provider **already existed** across the full stack.  
Two safety gaps were fixed and 18 deterministic tests were added.

---

## Provider status: already exists

### ConfigService.ts
- `ApiProvider` type includes `'google'`
- `PROVIDER_KEYS['google'] = 'GOOGLE_API_KEY'` (localStorage key)
- `LABEL_TO_PROVIDER['Google'] = 'google'`
- `getGoogleApiKey()` / `setGoogleApiKey()` already present
- **Fixed:** Removed `VITE_GOOGLE_API_KEY` fallback — key now comes only from localStorage (user Settings)

### buildAgentRouting.ts
- `endpointForProvider('google')` → `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
- `NATIVE_PROVIDER_HOSTS` includes `generativelanguage.googleapis.com`
- `classifyTransportPath()` returns `supabase_proxy` for Gemini in normal mode, `direct_provider` in dev-bypass
- Model ID normalization: `google/gemini-2.5-flash` → `gemini-2.5-flash` (prefix stripped for native endpoint)
- OpenRouter fallback fires automatically if `GOOGLE_API_KEY` is absent from localStorage

### backend/auth-token.ts
- `PROVIDER_ENV_KEYS['google'] = 'GOOGLE_API_KEY'`
- `STANDARD_PROVIDER_ENDPOINTS['google']` = Gemini OpenAI-compat endpoint
- `runStandardAgents()` reads `process.env[PROVIDER_ENV_KEYS['google']]` server-side
- Startup log: `GOOGLE_API_KEY=set/missing` (presence only, no value)

### Supabase proxy (supabase/functions/llm-proxy/index.ts)
- `ALLOWED_HOSTS` includes `generativelanguage.googleapis.com`
- Proxy is a transparent relay — receives the `Authorization: Bearer <key>` header from browser

---

## Key handling: where GOOGLE_API_KEY is read

| Call path | Where key is read |
|-----------|-------------------|
| Main build/coder pipeline | `localStorage['GOOGLE_API_KEY']` (set via Settings UI) → sent in `Authorization: Bearer` header → Supabase proxy → Google API |
| Dev-bypass mode | `localStorage['GOOGLE_API_KEY']` → browser direct → Google API |
| Standard Agents (backend) | `process.env.GOOGLE_API_KEY` — never reaches browser |

> **Design note:** For the main pipeline (ProtoPipeline/coder), the key is in localStorage and travels through the browser's Authorization header via LLMProxy. This is the same design as all other providers (OpenRouter, DeepSeek, OpenAI). The key is never committed or baked into the build.

---

## Changes made

### `frontend/src/services/ConfigService.ts`
- `getGoogleApiKey()`: Removed `|| (import.meta.env.VITE_GOOGLE_API_KEY ?? '')` fallback
- Key now comes ONLY from `localStorage['GOOGLE_API_KEY']` (user Settings)
- No VITE_ build-time secret leakage possible

### `frontend/.env` (gitignored)
- Removed `VITE_GOOGLE_API_KEY=` line
- `GOOGLE_API_KEY=` in `backend/.env` is unchanged (gitignored — backend process env)

### `frontend/src/services/__tests__/geminiLocalDiagnosticRoute.test.ts` (new)
- 18 deterministic tests covering:
  - direct route endpointKind when key present
  - endpoint points to googleapis.com, not openrouter.ai
  - model prefix stripped for native endpoint, preserved for OpenRouter
  - OpenRouter fallback fires with explicit reason when key absent
  - classifyTransportPath for Gemini in normal vs dev-bypass mode
  - `getGoogleApiKey()` returns `''` when localStorage empty (no VITE_ leak)
  - `GOOGLE_API_KEY` not written to localStorage by route resolution
  - No outbound fetch() during route resolution
  - `ModelSelectionRequiredError` thrown for `backend_factory_template` authority
  - Explicit `user_set` route resolves without backend factory config
  - Telemetry never emits API key material

---

## How to run a local diagnostic with GOOGLE_API_KEY

### Option A — Standard Agents path (key server-side only)

```bash
# Start backend with GOOGLE_API_KEY in process env
GOOGLE_API_KEY=AIza-your-key npm run dev --prefix backend

# Agent will use process.env.GOOGLE_API_KEY — key never reaches browser
```

### Option B — Main pipeline (ProtoPipeline / coder)

1. Set provider/model via Settings UI or test helper:
   ```js
   // In browser console or Playwright test helper:
   ConfigService.setAgentConfig('agent_build', {
     provider: 'google',
     modelId: 'google/gemini-2.5-flash',
   });
   ConfigService.setGoogleApiKey('AIza-your-key');
   // Source authority set to 'user_set' by setAgentConfig automatically
   ```

2. Start frontend + backend normally:
   ```bash
   npm run dev --prefix backend
   npm run dev --prefix frontend
   ```

3. Key travels: localStorage → Authorization header → Supabase proxy → Google API  
   Key is NOT committed, NOT in any VITE_ var, NOT in git.

### Required env vars (never commit)

| Var | Where | Purpose |
|-----|-------|---------|
| `GOOGLE_API_KEY` | `backend/.env` (gitignored) | Standard Agents path |
| `localStorage['GOOGLE_API_KEY']` | Browser (Settings UI) | Main pipeline path |

### Model IDs (for diagnostics)

| OpenRouter format | Native format (prefix stripped) |
|-------------------|---------------------------------|
| `google/gemini-2.5-flash` | `gemini-2.5-flash` |
| `google/gemini-2.5-pro` | `gemini-2.5-pro` |
| `google/gemini-2.0-flash` | `gemini-2.0-flash` |

> The Supabase proxy uses the OpenAI-compatible Gemini endpoint (`/v1beta/openai/chat/completions`), which accepts OpenAI-style request bodies.

---

## Tests run

| Suite | Count | Result |
|-------|-------|--------|
| `geminiLocalDiagnosticRoute.test.ts` | 18 | ✓ PASSED |
| `npm run typecheck --prefix frontend` | — | ✓ PASSED |

---

## Final git status

- Branch: `p2/coder-product-identity-substitution`
- Nothing pushed to remote ✓
- Files committed: see commit for `b603b4d` (DeepSeek safety) + this commit
- Runtime drift (preview-workspace/, trend-archive.json, scripts/*.mjs) — not committed

---

## Conclusion

- Google/Gemini provider existed already — no new transport needed
- `VITE_GOOGLE_API_KEY` fallback removed from `ConfigService.getGoogleApiKey()`
- Key is secret-safe: never in VITE_ vars, never in git, never logged
- Local diagnostic runs possible immediately via Settings UI or test helper
- 18 safety tests confirm correct behavior and zero real LLM calls
