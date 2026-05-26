# Build Model Routing Authority Diagnosis

## Summary

`xiaomi/mimo-v2-pro` reached the coder/runCoder slot because it is the value stored in
`backend/agent-config.json` under `agent_build.modelId`. On startup, `ConfigService.loadFromBackend()`
fetches this file and, when the `AGENT_CONFIG_agent_build` localStorage slot is empty, writes the
file value directly into localStorage. From that point the config is indistinguishable from a
user-chosen setting — `resolveModel('build')` reads from localStorage without any provenance marker.

**Root cause: `backend/agent-config.json` acts as a silent product default for any user whose
`agent_build` slot has never been explicitly saved via the Settings UI.**

---

## Source of `xiaomi/mimo-v2-pro` — chain of evidence

| Step | Location | Observation |
|---|---|---|
| 1 | `backend/agent-config.json` (line 16–17) | `"agent_build": { "provider": "openrouter", "modelId": "xiaomi/mimo-v2-pro" }` — committed factory value |
| 2 | `frontend/src/services/ConfigService.ts` (line 34) | `const DEFAULT_BUILD_MODEL_ID = 'xiaomi/mimo-v2-pro'` — in-code constant used in `AGENT_DEFAULTS`; vestigial (only provider is consumed from AGENT_DEFAULTS in getAgentConfig) |
| 3 | `ConfigService.loadFromBackend()` (line ~673) | Fetches `GET /agent-config`, and if `AGENT_CONFIG_agent_build` is absent from localStorage, writes the file value: `set('AGENT_CONFIG_agent_build', JSON.stringify(fileConfig))` — no source marker |
| 4 | `ConfigService.resolveModel('build')` | Reads `AGENT_CONFIG_agent_build` from localStorage → returns `"xiaomi/mimo-v2-pro"` — no way to tell it was file-seeded |
| 5 | `resolveStandardRoute('build')` in `buildAgentRouting.ts` | Calls `resolveModel('build')`, gets `"xiaomi/mimo-v2-pro"`, provider=`openrouter` → route is `openrouter/xiaomi/mimo-v2-pro` |
| 6 | `useStudio.ts` line ~4027 | Logs `routes resolved — primary: openai/gpt-4o-mini build: xiaomi/mimo-v2-pro` — **this is the console.log captured in the long-observation report** |
| 7 | `LLMProxy.ts` | All LLM calls go through Supabase Edge Function (`llm-proxy`) regardless of destination. The OpenRouter call for `xiaomi/mimo-v2-pro` is forwarded by the proxy, which returned HTTP 546. |

### Evidence quality

The log line `routes resolved — primary: openai/gpt-4o-mini build: xiaomi/mimo-v2-pro` in the
long-observation report **is real telemetry from the route resolver** (`console.log` at
`useStudio.ts:4027`), not a guess or stale workspace value. The model name came from the
`buildRoute.modelId` field resolved at generation time. The Supabase URL in the error is the
proxy transport layer — all LLM calls are proxied regardless of provider.

---

## Route authority chain for runCoder

```
backend/agent-config.json
  └─ ConfigService.loadFromBackend()                     [startup, once]
        │  if AGENT_CONFIG_agent_build is empty in localStorage
        └─ localStorage.setItem('AGENT_CONFIG_agent_build', fileConfig)
                                                          [no source marker before this fix]
              │
              └─ ConfigService.resolveModel('build')      [at generation time]
                    │  reads AGENT_CONFIG_agent_build → "xiaomi/mimo-v2-pro"
                    └─ ConfigService.resolveModelWithAuthority('build')   [new, diagnostic]
                          │  reads __source marker → 'backend_file_seed'
                          └─ resolveStandardRoute('build')
                                │  provider=openrouter, modelId=xiaomi/mimo-v2-pro
                                │  sourceAuthority=backend_file_seed
                                │  isUserSelected=false
                                │  isRuntimeConfig=true
                                └─ LLMProxy.llmFetchStream(openrouter endpoint, ...)
                                      │  routed through Supabase llm-proxy
                                      └─ HTTP 546 ← OpenRouter error for xiaomi/mimo-v2-pro
```

---

## Is the user-selected model currently guaranteed to win?

**Partially.** The resolution chain in `resolveModel` reads:

1. `AGENT_CONFIG_agent_build` (slot-specific) — wins unconditionally if present
2. `AGENT_CONFIG_agent_primary` (primary fallback)
3. `ENGINE_MODEL_ID`
4. `SELECTED_MODEL`

If the user has explicitly configured the build slot via Settings, that value writes to
`AGENT_CONFIG_agent_build` with `__source=user_set` and wins. **The problem is step 1 itself
is not filtered by authority** — `loadFromBackend` also writes to this same slot from the
file, so a fresh-install or cleared-storage user gets the file value with no indication it
was never user-chosen.

**Is a silent switch possible?** Yes, under two conditions:
- User never opened Settings → build slot is file-seeded → factory model used silently
- User cleared localStorage → build slot is re-seeded from file on next startup

---

## Changes made

### Diagnostic telemetry added (no routing behavior change)

#### `frontend/src/services/ConfigService.ts`
- Export `AgentConfigAuthority` type — describes model provenance with 7 distinct values
- Add `AGENT_CONFIG_SOURCE_SUFFIX = '__source'` — companion localStorage key per agent slot
- `setAgentConfig()` — now also writes `AGENT_CONFIG_${agentId}__source = 'user_set'`
- `loadFromBackend()` — now also writes `AGENT_CONFIG_${agentId}__source = 'backend_file_seed'`
  when seeding an empty slot from the file
- New method `resolveModelWithAuthority(slot)` — returns `{modelId, authority}` alongside
  the model ID, tracing through the full resolution chain

#### `frontend/src/services/buildAgentRouting.ts`
- `AgentExecutionRoute` interface gets 4 new diagnostic fields:
  - `sourceAuthority: AgentConfigAuthority`
  - `isUserSelected: boolean`
  - `isRuntimeConfig: boolean`
  - `isProxyFallback: boolean`
- `resolveStandardRoute()` calls `resolveModelWithAuthority` (replaces `resolveModel`) and
  populates the diagnostic fields; all three code paths (normal, anthropic fallback,
  missing-key fallback) include the fields
- `[RouteResolver]` log now includes `[authority=...]`

#### `frontend/src/shared/projectModel.ts`
- `TraceRouteRecord` gets 4 optional diagnostic fields: `sourceAuthority`, `isUserSelected`,
  `isRuntimeConfig`, `isProxyFallback`

#### `frontend/src/hooks/useStudio.ts`
- `buildTraceRouteRecord()` propagates the 4 new diagnostic fields into the trace record
- `[Route] build:` addLog now includes `[authority=... runtime-config]` annotation
- New `console.log('[RouteAuthority] build slot', {...})` emits all 9 required
  `generation_route_*` fields as a structured object immediately after route resolution

### Telemetry fields now emitted

```
generation_route_slot
generation_route_provider
generation_route_model_id
generation_route_key_source
generation_route_source_authority
generation_route_fallback_reason
generation_route_is_user_selected
generation_route_is_runtime_config
generation_route_is_proxy_fallback
```

### Tests added

`frontend/src/services/__tests__/buildAgentRouting.routingAuthority.test.ts` — 16 tests, all pass

Covers:
- user_set authority wins over backend_file_seed
- file-seeded model is labelled `backend_file_seed`, not `user_set`
- `backend/agent-config.json` seeded value is NOT treated as user selection
- Routing fallback reasons are explicit (anthropic, missing-key)
- No silent provider switch without fallbackReason
- `no_model_configured` when nothing is set
- `primary_fallback` authority when build slot is empty but primary is set
- `localStorage_unknown` for pre-migration data without a source marker
- All 9 `generation_route_*` telemetry fields present on the route object
- No API key material in diagnostic fields

---

## Conclusions

### Was the source of `xiaomi/mimo-v2-pro` proven?

**Yes — definitively.** It came from `backend/agent-config.json` via `ConfigService.loadFromBackend()`
seeding the `AGENT_CONFIG_agent_build` localStorage slot on startup. The user never explicitly chose
this model. The console log in the long-observation report (`routes resolved — primary:
openai/gpt-4o-mini build: xiaomi/mimo-v2-pro`) is the route resolver's own log — it is real
telemetry, not inferred.

### Is it safe to not change backend/agent-config.json?

The file itself is not the direct problem — it is a valid place to store per-agent configuration.
The problem is that the sync logic treats the file value as equivalent to a user choice when no
user choice exists. With the source tracking added, the distinction is now visible in telemetry.
Changing the model in `backend/agent-config.json` as a product default is explicitly not recommended
per the product rule: model/provider selection must come from user/runtime settings.

### What remains

- Existing users with `AGENT_CONFIG_agent_build` already in localStorage (seeded before this
  change) will show `localStorage_unknown` authority. A future migration pass could re-classify
  these by comparing against the file value if needed.
- The file-seed path is still the effective product default for fresh installs. A future step
  could add a "first-run" prompt or require the user to actively choose a model before generation.

---

## Recommended next implementation step

Add a first-run model selection gate: if `generation_route_is_user_selected = false` and
`generation_route_source_authority ≠ 'user_set'` at generation time, surface a Settings prompt
before the first coder call so the user actively confirms or changes the build model. This ensures
no generation silently uses a factory default without user awareness.
