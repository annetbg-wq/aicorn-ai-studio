# Enforce User-Selected Model Authority

## Summary verdict
COMPLETE — factory config is no longer route authority for the build/coder slot.

## Problem recap
`backend/agent-config.json` → `loadFromBackend()` silently seeded `localStorage` with the
factory-committed `provider`/`modelId` (e.g. `xiaomi/mimo-v2-pro`) using the `backend_file_seed`
marker. `resolveModelWithAuthority('build')` then returned that value as if user-chosen.
`resolveStandardRoute('build')` built a real route from it — no error, no warning, no user
prompt to configure a model.

## Root-cause confirmed
- Source: `backend/agent-config.json` → `loadFromBackend()` → `localStorage[AGENT_CONFIG_agent_build]`
- Marker written: `backend_file_seed` (labelled as runtime-config by `isRuntimeConfig` flag)
- `resolveModelWithAuthority` did not block the factory model from becoming route authority
- `resolveStandardRoute` did not throw — silently used `xiaomi/mimo-v2-pro`

## Changes made

### `backend/auth-token.ts`
- `GET /agent-config` now returns `{ ...data, _configSource: 'runtime' | 'factory' }`
- `'runtime'` when `agent-config.runtime.json` exists (user saved Settings)
- `'factory'` when falling back to committed `agent-config.json`

### `frontend/src/services/ConfigService.ts`
- Added `'backend_runtime_saved'` and `'backend_factory_template'` to `AgentConfigAuthority`
- `resolveModelWithAuthority()` now maps both `backend_file_seed` and `backend_factory_template`
  source markers → returns authority `'backend_factory_template'` (both are factory, not user)
- **`loadFromBackend()` rewritten** — three distinct paths:
  1. **Legacy `backend_file_seed` in localStorage** → migrate: strip `provider`/`modelId`, keep
     only `maxTokens`, upgrade marker to `backend_factory_template`. Route resolution now finds
     no modelId and will throw `ModelSelectionRequiredError` for the build slot.
  2. **`backend_factory_template` already in localStorage** → skip (already migrated).
  3. **`user_set` / `backend_runtime_saved` / unknown** → push diverged values back to runtime
     file (no change to user intent).
  - **Empty slot + `configSource='factory'`** → seeds only `maxTokens`, marker
    `backend_factory_template`. `provider`/`modelId` are **NOT** seeded.
  - **Empty slot + `configSource='runtime'`** → seeds all fields (user saved Settings),
    marker `backend_runtime_saved`.

### `frontend/src/services/buildAgentRouting.ts`
- Exported new class **`ModelSelectionRequiredError`** — typed error with `slot` and `authority`
  fields. Message tells user to open Settings → Agent Models.
- Added `FACTORY_OR_EMPTY_AUTHORITIES` set: `{backend_factory_template, backend_file_seed,
  no_model_configured}`.
- **`resolveStandardRoute('build')`** now throws `ModelSelectionRequiredError` when
  `sourceAuthority` is in `FACTORY_OR_EMPTY_AUTHORITIES`. Factory config can never produce
  a route for the build slot.
- Added `isFactoryConfig: boolean` to `AgentExecutionRoute` interface. Always `false` on
  returned routes (factory authority throws before returning).
- Fixed `isRuntimeConfig`: now `sourceAuthority === 'backend_runtime_saved'` (was
  `=== 'backend_file_seed'` — an inversion of the intended meaning).

### `frontend/src/shared/projectModel.ts`
- Added `isFactoryConfig?: boolean` to `TraceRouteRecord`.

### `frontend/src/hooks/useStudio.ts`
- Imported `ModelSelectionRequiredError`.
- Route resolution block (lines ~4017–4022) wrapped in `try/catch`:
  - On `ModelSelectionRequiredError` → calls `failBeforePipelineRun()` with user-friendly
    message: "Build model not configured. Open Settings → Agent Models…"
  - Other errors re-thrown.
- `buildTraceRouteRecord()` now includes `isFactoryConfig`.
- Route log and `[RouteAuthority]` telemetry include `generation_route_is_factory_config`.

### `frontend/src/services/__tests__/buildAgentRouting.routingAuthority.test.ts`
- Updated all factory-authority tests to expect `toThrow(ModelSelectionRequiredError)`.
- Added `setRuntimeConfig()` helper; new describe block confirming `backend_runtime_saved`
  allows route construction without throwing.
- Added describe block "factory config blocks route construction" — 3 targeted tests.
- Updated `resolveModelWithAuthority` test: `backend_file_seed` now maps to
  `backend_factory_template` authority.
- Added test: `isFactoryConfig` is always `false` on returned routes.
- Total: **26 tests, all passing**.

### `frontend/src/services/__tests__/ArtifactReviewerService.test.ts`
- Added `isFactoryConfig: false` to fake `AgentExecutionRoute` literal.

## Route authority chain after fix

| Priority | Source | Allowed for build slot? |
|---|---|---|
| 1 | `user_set` (Settings UI) | ✅ yes |
| 2 | `backend_runtime_saved` (user saved via Settings, runtime file) | ✅ yes |
| 3 | `localStorage_unknown` (pre-migration data) | ✅ yes (backward compat) |
| 4 | `primary_fallback` (build empty, primary configured) | ✅ yes |
| 5 | `engine_model` / `selected_model` | ✅ yes |
| 6 | `backend_factory_template` (factory config, incl. migrated `backend_file_seed`) | ❌ throws |
| 7 | `no_model_configured` | ❌ throws |

## Fresh install / cleared localStorage behaviour
1. `loadFromBackend()` runs at startup.
2. `_configSource = 'factory'` → only `maxTokens` is seeded, marker `backend_factory_template`.
3. User opens Studio and clicks Generate.
4. `resolveStandardRoute('build')` → `resolveModelWithAuthority` returns
   `{ modelId: '', authority: 'no_model_configured' }` (no modelId in factory template).
5. Guard fires: `FACTORY_OR_EMPTY_AUTHORITIES.has('no_model_configured')` → throws
   `ModelSelectionRequiredError`.
6. `useStudio` catches it → `failBeforePipelineRun` → chat shows:
   *"Build model not configured. Open Settings → Agent Models and select a model."*
7. User opens Settings, selects a model → saved → `backend_runtime_saved` authority.
8. Next generate: route resolves normally.

No silent generation with factory defaults. No `xiaomi/mimo-v2-pro` unless explicitly chosen.

## Confirmations
- `backend/agent-config.json` is **no longer route authority** — seeded factory values are
  stripped of `provider`/`modelId` on migration or fresh seed.
- User-selected model always wins (priority 1).
- No default model/provider was changed. `backend/agent-config.json` is untouched.
- No real LLM calls in tests.
- `backend/agent-config.runtime.json` is not committed (gitignored).

## Validation
```
npm run typecheck --prefix frontend   → exit 0 ✅
vitest run buildAgentRouting.routingAuthority.test.ts → 26/26 passed ✅
vitest run ArtifactReviewerService.test.ts → 5/5 passed ✅
```

## Files changed
- `backend/auth-token.ts`
- `frontend/src/services/ConfigService.ts`
- `frontend/src/services/buildAgentRouting.ts`
- `frontend/src/shared/projectModel.ts`
- `frontend/src/hooks/useStudio.ts`
- `frontend/src/services/__tests__/buildAgentRouting.routingAuthority.test.ts`
- `frontend/src/services/__tests__/ArtifactReviewerService.test.ts`
- `artifacts/quality-snapshots/enforce-user-selected-model-authority.md` (this file)
