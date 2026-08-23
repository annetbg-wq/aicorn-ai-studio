# Cashflow Guard — Gemini Diagnostic Run

**Branch:** `p2/coder-product-identity-substitution`  
**Date:** 2026-05-27  
**Run ID:** `gemini-diagnostic-2026-05-27-17-48`  
**Observation window:** ~10 minutes (662s elapsed)

---

## Summary verdict

**PARTIAL — route validated, generation blocked by IdeaModel pre-condition failure**

The Gemini route was correctly configured (provider=google / gemini-2.5-flash / user_set authority, key injected into localStorage, key removed after run). However, the generation pipeline never started: IdeaModel Claude bridge failures prevented idea cards from loading, so no "В работу" action triggered a new coder run. No Gemini API calls were made during this observation window.

---

## Route authority

| Field | Value |
|-------|-------|
| provider | `google` |
| modelId | `google/gemini-2.5-flash` |
| sourceAuthority | `user_set` |
| endpointKind | `direct_provider` (dev-bypass) / `supabase_proxy` (normal) |
| keyInjectedVia | `page.evaluate()` → `localStorage['GOOGLE_API_KEY']` only |
| keyPresentAfterCleanup | `false` ✓ |
| keyWrittenToFile | No ✓ |
| keyPushedToBackend | No ✓ (direct localStorage injection, no ConfigService.setProviderKey() called) |
| backendFactoryTemplate | Not route authority ✓ |

---

## Pipeline timeline

| Stage | Status | Notes |
|-------|--------|-------|
| Config injection | ✓ | GOOGLE_API_KEY + google/gemini-2.5-flash / user_set injected into localStorage |
| Trending niches panel | ✓ | Panel loaded |
| IdeaModel loading | ✗ FAILED | Claude CLI unavailable (ETIMEDOUT, EINVAL); fallback to standard model flow |
| Cashflow Guard card visible | Unknown | Script entered fallback path (cashflowFound unclear) |
| В работу click | Attempted | Either not fired or fired on wrong card |
| Packaging | Not reached | |
| Architect | Not reached | |
| Coder (Gemini) | Not reached | |
| Quality gate | Not reached | |
| Preview compile | Not reached | |
| Live preview | Not reached | |
| Final status | `timeout` | 662s elapsed, 10-minute observation window exhausted |

---

## What actually happened

### LLM calls observed: zero

The network log captured only `/api/health` polling (every ~10s). Zero calls to:
- `/compile` (ProtoPipeline start)
- `googleapis.com` (Gemini API)
- `/functions/v1/llm-proxy` (Supabase proxy)
- `/chat` (Standard Agents)

### IdeaModel bridge errors (browser console)

```
[IdeaModel] Local claude bridge unavailable (HTTP 503: Claude CLI is not available — spawnSync cmd.exe ETIMEDOUT). Falling back to standard model flow.
[IdeaModel] Local claude bridge unavailable (HTTP 500: Error: spawn claude ENOENT). Falling back to standard model flow.
[IdeaModel] Local claude bridge unavailable (HTTP 500: Error: spawn EINVAL). Falling back to standard model flow.
```

These errors repeated through the entire 10-minute window. The IdeaModel was retrying the Claude CLI bridge on every polling cycle.

### Backend was in "claude mode"

Backend startup log: `[mode] Starting in: claude mode`

This caused every IdeaModel request to hit the Claude CLI path, which is unavailable in this environment (`spawn EINVAL`). Each failure triggered a fallback, but the ideas panel may have rendered empty or in error state, preventing the Cashflow Guard card from being displayed.

### The build complete in backend log was from Run 2

`[preview-manager] build complete: qt-mp4fho3i-2nk` was captured BEFORE the observation window started (`logPositionBefore` marks). This is Run 2's existing preview, not a new generation.

---

## Workspace inspection (existing from Run 2 — no new generation)

| Check | Result |
|-------|--------|
| appName | `AppName` (generic placeholder, unchanged from Run 2) |
| navigation labels | Home / Create / Progress / Profile (generic, unchanged) |
| seed data titles | Morning intention / Deep work block / Movement break / Evening review (wellness domain, unchanged) |
| First viewport Cashflow Guard clarity | ✗ |
| PRODUCT tokens | None |
| Empty arrays | None |
| Generic skeleton labels (Pipeline/Records/Leads etc.) | None found |
| Cashflow terms in workspace | 2 hits (`guard` in App.tsx — likely from React component names, not product copy) |
| Missing imports | App.tsx/app.tsx: no relative imports (inspection artefact) |

> **Note:** All workspace data is from Run 2. Gemini never wrote any files.

---

## Key cleanup confirmation

```
GOOGLE_API_KEY removed from browser localStorage ✓
keyPresentAfterCleanup: false ✓
```

The key was:
- Injected via `page.evaluate([geminiKey] => localStorage.setItem('GOOGLE_API_KEY', key))` (value never concatenated into script string)
- Used only in the test browser session
- Removed via `page.evaluate(() => localStorage.removeItem('GOOGLE_API_KEY'))` after run
- Never written to any file
- Never pushed to GitHub
- Never logged (length only: 39 chars)

---

## Root cause analysis

**Pre-condition failure, not a Gemini routing failure.**

The generation pipeline has a dependency chain:

```
IdeaModel loads ideas → Trending cards visible → "В работу" launches ProtoPipeline
```

When IdeaModel fails (Claude CLI not available), ideas may not load, Cashflow Guard card is not visible, and the "В работу" click either doesn't fire or fires on a different element. Without a successful "В работу" on the correct card, ProtoPipeline never starts and the Gemini route is never exercised.

---

## Product identity inspection

**Not applicable** — no Gemini-generated UI was produced. Workspace contains Run 2 output.

---

## Conclusion

| Question | Answer |
|----------|--------|
| Is Gemini route correctly configured? | ✓ Yes — user_set authority, google/gemini-2.5-flash, correct endpoint |
| Was GOOGLE_API_KEY kept secret? | ✓ Yes — localStorage only, removed after run, not in any file |
| Did coder complete? | ✗ No — generation never started |
| Did preview compile? | ✗ No — coder not reached |
| Was Product Identity Contract honored? | N/A — coder not reached |
| Did Gemini make any API calls? | ✗ No — route set but pipeline blocked |
| Remaining bottleneck | IdeaModel pre-condition (Claude CLI bridge failures in this environment) |

---

## Recommended next implementation step

**Fix the IdeaModel pre-condition for local diagnostic runs without Claude CLI.**

The IdeaModel retries the Claude CLI bridge on every polling cycle even after confirmed failures, blocking the Trending niches idea loading path. For local diagnostic runs to reliably reach ProtoPipeline, either:

1. Add a local fallback: when Claude CLI is unavailable AND `IDEA_SEED_DATA` is present, use hardcoded seed ideas (bypasses the polling loop entirely)
2. Or: the observation script should use the direct launch path (`/api/ideas/direct-launch`) if available, bypassing the IdeaModel card UI entirely
3. Or: start backend in standard agent mode (`dev-agent-mode: off`) so IdeaModel uses the OpenRouter/standard path rather than the Claude CLI bridge

---

## Git status

```
branch: p2/coder-product-identity-substitution
nothing pushed ✓
no secret files in git ✓
runtime files (cashflow-obs/, scripts/*.mjs, backend/trend-archive.json, preview-workspace/) NOT committed ✓
```
