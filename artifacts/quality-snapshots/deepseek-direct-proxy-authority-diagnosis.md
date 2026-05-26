# DeepSeek Direct / Proxy Authority Diagnosis

**Branch:** `p2/trace-deepseek-direct-proxy-authority`
**Scope:** LOCAL ONLY — no push, no PR, no CI.

---

## 1. Question Under Investigation

Recent diagnostics described the transport path as:

> Supabase llm-proxy → OpenRouter → DeepSeek

This was suspicious: if the user selected `provider=deepseek` with an explicit
`DEEPSEEK_API_KEY`, OpenRouter should not appear in the chain.

The goal was to determine which of these is true:

| Label | Path |
|-------|------|
| **A** | Frontend → DeepSeek API (direct, dev-bypass only) |
| **B** | Frontend → Supabase llm-proxy → api.deepseek.com (normal mode) |
| **C** | Frontend → Supabase llm-proxy → api.openrouter.ai → DeepSeek |
| **D** | Stale telemetry / incorrect report wording |

---

## 2. Verdict

**Path B is correct.** With `DEEPSEEK_API_KEY` present and `provider=deepseek`:

```
Frontend → Supabase functions/v1/llm-proxy → https://api.deepseek.com/v1/chat/completions
```

OpenRouter is **NOT** in this path and should never appear unless:
- `DEEPSEEK_API_KEY` is absent (missing-key fallback rule), OR
- `provider=anthropic` (streaming fallback rule).

Neither condition is met when the user has explicitly selected DeepSeek with a key set.

---

## 3. Source of the "OpenRouter" Claim

The "Supabase llm-proxy → OpenRouter → DeepSeek" description was **stale and incorrect**.
It originated from two sources:

### 3a. Stale diagnosis artifact

`artifacts/quality-snapshots/build-model-routing-authority-diagnosis.md` diagnosed
`provider=openrouter`, `model=xiaomi/mimo-v2-pro` — a completely different model/provider.
The description was copied or conflated with the DeepSeek scenario without verification.

### 3b. Misleading comment in `LLMTransportError.ts`

Line ~113 contained:
```ts
// HTTP 546 is a non-standard code used by the OpenRouter→DeepSeek proxy chain
```
This comment was written for the OpenRouter/mimo-v2-pro scenario. When PR #38 re-used
this function for DeepSeek-direct, the comment remained unchanged, creating the false
impression that 546 always implies OpenRouter.

**The 546 error comes from DeepSeek's own API (or an OpenRouter hop) — the comment was
never evidence of the actual transport path.**

---

## 4. Routing Logic (Code Evidence)

### `buildAgentRouting.ts` — `resolveStandardRoute()`

Three ordered rules determine the route:

| # | Condition | Result |
|---|-----------|--------|
| **Rule 1 (normal)** | `provider=deepseek` + key present | `endpoint = https://api.deepseek.com/v1/chat/completions` |
| **Rule 2 (missing key)** | key absent AND `provider ≠ openrouter` | fallback to OpenRouter (`endpointKind=openrouter_proxy`, explicit `fallbackReason`) |
| **Rule 3 (anthropic)** | `provider=anthropic` | fallback to OpenRouter (`endpointKind=openrouter_proxy`, explicit `fallbackReason`) |

For the user-selected `provider=deepseek` + `DEEPSEEK_API_KEY` present:
- Rule 2 does **not** fire (key is present)
- Rule 3 does **not** fire (provider ≠ anthropic)
- Rule 1 fires: `endpoint = https://api.deepseek.com/v1/chat/completions`

### `LLMProxy.ts` — `proxyRequestWithSessionFallback()`

All production LLM calls go through:
```
PROXY_URL = ${SUPABASE_URL}/functions/v1/llm-proxy
```
Exception: `devBypassEnabled && !isPlaywrightTest` → calls `directLLMRequest()` (Path A).

### `supabase/functions/llm-proxy/index.ts`

The edge function is a **transparent relay**:
```ts
const response = await fetch(endpoint, { method: 'POST', headers, body });
```
It forwards to whatever `endpoint` was passed. `api.deepseek.com` is in `ALLOWED_HOSTS`.
It does **not** reroute to OpenRouter unless `endpoint` IS `openrouter.ai`.

---

## 5. Model ID Normalization

`normalizeModelForEndpoint('deepseek/deepseek-v4-pro', 'https://api.deepseek.com/...')`
returns `'deepseek-v4-pro'` — prefix is stripped for native endpoints.

OpenRouter endpoints preserve the full `provider/model` format (e.g. `deepseek/deepseek-v4-pro`).
This is a strong indicator in logs: if the model ID has no prefix in the request body,
it went to the native endpoint, not OpenRouter.

---

## 6. Evidence from Observation Artifact

`artifacts/quality-snapshots/cashflow-guard-user-model-long-observation.md` confirms:
- `provider: deepseek`
- `model: deepseek-v4-pro` (prefix already stripped — native endpoint)
- `keySource: DEEPSEEK_API_KEY (VITE_DEEPSEEK_API_KEY env)`
- `fallbackReason: none`
- `sourceAuthority: user_set`

No OpenRouter key was used. No fallback reason was logged. This is fully consistent
with Path B (Supabase proxy → DeepSeek direct).

The HTTP 546 at the coder step was classified as `proxy_resource_limit` — this reflects
a DeepSeek-side rate/quota limit, not an OpenRouter hop.

---

## 7. Changes Made

### 7a. `frontend/src/services/buildAgentRouting.ts`

Added to `AgentExecutionRoute` interface:
```ts
endpointKind: 'direct_provider' | 'supabase_proxy' | 'openrouter_proxy' | 'unknown';
isExplicitFallback: boolean;
```

Added exports:
- `classifyTransportPath(endpoint, devBypassActive)` — classifies transport kind
- `recordLlmRouteTelemetry(route)` — emits `[llm_route]` log with fields:
  - `llm_route_provider`
  - `llm_route_model_id`
  - `llm_route_endpoint_kind`
  - `llm_route_proxy_provider` (`null` for native, `'openrouter'` for OpenRouter)
  - `llm_route_key_source`
  - `llm_route_fallback_reason`
  - `llm_route_authority_source`
  - `llm_route_is_explicit_fallback`

All three branches of `resolveStandardRoute()` now call `recordLlmRouteTelemetry()` and
populate `endpointKind` and `isExplicitFallback`.

Fixed: missing closing `}` on `resolveStandardRoute()` (syntax error introduced during
telemetry additions).

### 7b. `frontend/src/services/LLMTransportError.ts`

Fixed misleading comment on the `proxy_resource_limit` classification for HTTP 546.
Old (incorrect):
```ts
// HTTP 546 is a non-standard code used by the OpenRouter→DeepSeek proxy chain
```
New (accurate):
```ts
// HTTP 546 is a non-standard code that can come from DeepSeek's API directly,
// or from OpenRouter when it cannot reach the downstream provider.
```

### 7c. `frontend/src/services/__tests__/deepseekDirectProxyAuthority.test.ts` (new)

30 deterministic tests, no real LLM calls. Covers:
- DeepSeek direct route: `endpointKind=direct_provider` (in dev-bypass) or `supabase_proxy` (normal)
- Model ID normalization for native vs OpenRouter endpoints
- `isExplicitFallback=false` for normal DeepSeek route
- Missing-key fallback → `openrouter_proxy` + explicit `fallbackReason`
- Anthropic fallback → `openrouter_proxy` + explicit `fallbackReason`
- `classifyTransportPath` for all endpoint kinds and dev-bypass flag
- `recordLlmRouteTelemetry` emits all required fields, no API key material
- Provider/model label consistency vs `endpointKind`

### 7d. `frontend/src/services/__tests__/ArtifactReviewerService.test.ts` (updated)

Added `isExplicitFallback: false` and `endpointKind: 'unknown'` to the `fakeRoute`
fixture to satisfy the updated `AgentExecutionRoute` interface.

---

## 8. Tests Run Locally

```
 ✔  deepseekDirectProxyAuthority.test.ts    30 passed
 ✔  ArtifactReviewerService.test.ts         (all passed)
 ✔  LlmTransportError.test.ts              55 passed
```

TypeScript typecheck: `npm run typecheck --prefix frontend` → exit 0.

---

## 9. OpenRouter Usage Summary

| Scenario | OpenRouter involved? | Explicit? |
|----------|---------------------|-----------|
| `provider=deepseek` + key present | **No** | N/A |
| `provider=deepseek` + key absent | Yes (fallback) | Yes — `fallbackReason=missing_provider_key_fallback` |
| `provider=anthropic` | Yes (fallback) | Yes — `fallbackReason=anthropic_streaming_fallback` |
| `provider=openrouter` | Yes (primary) | Yes — no fallback, primary route |

OpenRouter is **never implicit** for DeepSeek-direct when the key is present.

---

## 10. Final Status

- **Branch:** `p2/trace-deepseek-direct-proxy-authority`
- **Nothing was pushed to GitHub**
- **No PR created**
- **No CI triggered**
- **No model/provider defaults changed**
- **No real LLM calls in tests**
