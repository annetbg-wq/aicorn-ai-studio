# Cashflow Guard After Product Identity Contract

**Branch:** `p2/coder-product-identity-substitution`  
**Run 1:** 2026-05-26T23:47 UTC — FAIL (HTTP 546 / mimo-v2-pro on coder)  
**Run 2:** 2026-05-27T12:26 UTC — PARTIAL (gpt-4o-mini, coder completed, preview compiled, identity not applied)  
**Observation window:** 10 minutes  
**Idea launched:** Cashflow Guard для фрилансеров (Trending niches / Idea Bank)

---

## Summary verdict

**PARTIAL** (Run 2)

- Coder completed ✓, preview compiled ✓, no HTTP 546 ✓
- Product Identity Substitution Contract reached coder prompt (1384 chars confirmed) ✓
- Model (gpt-4o-mini) did NOT apply identity substitutions — skeleton placeholders remain throughout

---

## Route authority (Run 2)

- **provider:** openrouter
- **model (build/coder):** `openai/gpt-4o-mini`
- **model (primary/architect):** `openai/gpt-4o-mini`
- **endpoint kind:** `openrouter_proxy`
- **source authority:** `backend_runtime_saved` (runtime file reset to gpt-4o-mini before run)
- not backend_factory_template ✓
- not backend_file_seed ✓
- not no_model_configured ✓

> Note: Run 1 failed because `xiaomi/mimo-v2-pro` was on the coder slot via a localStorage→backend
> sync bug. That bug was fixed in commit `0043cda` before Run 2.

---

## Pipeline timeline (Run 2)

| Stage | Status | Notes |
|---|---|---|
| Packaging | ✓ COMPLETE | blueprint packaged, context_contract_chars: 1384 |
| Architect | ✓ COMPLETE | gpt-4o-mini, ~8s |
| Skeleton selected | mobile-app | correct for mobile-first product |
| Skeleton contract emitted | ✓ YES | skeleton_contract_chars: 1228 |
| Product Identity Contract emitted | ✓ YES | context_contract_chars: 1384 (+824 over skeleton-only) |
| Coder | ✓ COMPLETE | gpt-4o-mini, planning_blocks_chars: 57516, coder ran to completion |
| Quality gate | not reached | build moved to repair before QG |
| Repair | ✓ RAN | gpt-4o-mini, route_authority: backend_runtime_saved |
| Preview compile | ✓ SUCCESS | |
| Live preview ready | ✓ YES | final_status: success at ~229s |

---

## Product identity inspection (Run 2)

| Check | Result |
|---|---|
| First viewport clarity | ✗ FAIL — `APP_CONFIG.name = 'AppName'`, header shows "Today's space" |
| KPI labels | ✗ FAIL — `Streak / Done / Total` (generic progress tracker) |
| Data/table/list labels | ✗ FAIL — seed data: "Morning intention", "Deep work block", "Movement break" (wellness) |
| Mock data authenticity | ✗ FAIL — wellness/productivity theme, no cashflow/invoice/payment data |
| Navigation labels | ✗ FAIL — Home / Create / Progress / Profile (unmodified skeleton BottomTabs) |
| Generic skeleton labels remaining | `Home`, `Create`, `Progress`, `Profile`, `New item`, `Progress`, `Today's space` |
| Cashflow-specific terms in workspace | ✓ 1 file contains 'cashflow' (App.tsx build ID only) |

---

## Workspace inspection (Run 2)

| Check | Result |
|---|---|
| Missing imports/components | ✓ NONE — all imports resolve |
| PRODUCT token status | Comments remain (`/* PRODUCT: ... */`) but no blocking tokens |
| Empty array status | ✓ NONE |
| Compile status | ✓ SUCCESS |
| UI quality notes | Compiles and renders; wellness scaffold, not cashflow product |

**Files generated:** App.tsx, Home.tsx, Create.tsx, Progress.tsx, Profile.tsx, Onboarding.tsx, Detail.tsx + data/seed.ts, config/app.ts, config/navigation.ts

**Key unchanged skeleton placeholders:**
- `config/app.ts`: `name: 'AppName'`, `tagline: 'A short, calm space to make consistent progress.'`
- `config/navigation.ts`: labels `Home / Create / Progress / Profile`
- `data/seed.ts`: wellness seed data (Morning intention, Deep work block, etc.)
- `pages/Home.tsx`: header `Today's space`, renders SEED_FEED
- `pages/Onboarding.tsx`: `Welcome to ${APP_CONFIG.name}` (= "Welcome to AppName")

---

## Conclusion

**Did Product Identity Substitution Contract improve product-specific UI?**  
No measurable improvement in Run 2. The contract reached the coder prompt (confirmed: +824 chars vs previous run), but gpt-4o-mini produced an identical wellness scaffold with unmodified placeholder strings. The model received the substitution mandate but did not apply it.

**Did coder complete?**  
✓ Yes — Run 2 completed successfully. This is an improvement over Run 1 (HTTP 546 kill at 150s).

**Did preview compile?**  
✓ Yes — preview reached live status at ~229s.

**Is remaining bottleneck product identity, visual quality, data authenticity, repair, compile, or model reliability?**  
**Product identity + model instruction-following.** The coder slot (gpt-4o-mini) has a 57,516-char planning context, skeleton files, and the Product Identity Contract all arriving simultaneously. The model completes generation but does not apply identity substitutions — it reproduces the skeleton structure with placeholder strings intact. The contract text is present but not acted upon. This is a model capability/capacity issue at current context load.

---

## Recommended next implementation step

**Pre-coder identity injection:** Before invoking the coder, add a lightweight dedicated step that rewrites the skeleton identity config files (`config/app.ts`, `config/navigation.ts`, `data/seed.ts`) directly from the Product Assembly Plan / brief. This is a small targeted write (~3 files, ~100 lines) that can reliably be performed by a smaller/cheaper model call before the heavy coder pass. The coder then receives pre-substituted files and only needs to write domain logic — not track identity tokens at the same time.

---

## Summary verdict

**FAIL**

HTTP 546 (proxy_resource_limit) killed the coder at ~150 s. Coder did not complete. Workspace contains unmodified mobile-app skeleton. Product Identity Substitution Contract was correctly emitted in the coder prompt (`context_contract_chars: 1384`, up from 560 on the skeleton-contract-only run), but the model response was never received due to the 546 error. Product identity cannot be assessed from this run's output.

---

## Route authority

| Field | Value |
|---|---|
| provider | openrouter |
| model (build/coder) | `xiaomi/mimo-v2-pro` |
| model (primary/architect) | `openai/gpt-4o-mini` |
| endpoint kind | `openrouter_proxy` |
| source authority | `backend_runtime_saved` |
| not backend_factory_template | ✓ |
| not backend_file_seed | ✓ |
| not no_model_configured | ✓ |

---

## Pipeline timeline

| Stage | Status | Notes |
|---|---|---|
| Packaging (Дизайн-пак) | ✓ COMPLETED | context_contract_chars: 1384, planning_blocks_chars: 57640 |
| Architect | ✓ COMPLETED | openai/gpt-4o-mini, 10.6 s, success |
| Skeleton selection | ✓ mobile-app | Appropriate for "mobile-first финансовый помощник" |
| Skeleton contract emitted | ✓ YES | skeleton_contract_chars: 1228 |
| Product Identity Substitution Contract emitted | ✓ YES | context_contract_chars: 1384 (+824 vs skeleton-only run) |
| Coder | ✗ FAILED | xiaomi/mimo-v2-pro — HTTP 546 at 150 597 ms |
| HTTP 546 | ✓ YES | `proxy_resource_limit`, no retry |
| Quality gate | ✗ NOT REACHED | Coder failed first |
| Repair | ✗ NOT REACHED | Coder failed first |
| Preview compile | ⚠ SKELETON ONLY | proto_pipeline_complete (skeleton preview), coder build never triggered |
| Live preview ready | ✗ NO | "Превью временно недоступно" at ~211 s |
| Final status | **fail_preview_unavailable** | Observation ended at 211 s |

### Coder prompt block sizes (confirmed in browser console)
```
skeleton_header_chars:      410
context_contract_chars:    1384   ← Product Identity Contract included
planning_blocks_chars:    57640
skeleton_foundation_chars:  3922
skeleton_contract_chars:    1228
```
Previous run (skeleton contract only): `context_contract_chars: 560`  
**Δ = +824 chars** — Product Identity Substitution Contract is reaching the coder prompt.

---

## Product identity inspection

> ⚠ The workspace reflects the unmodified mobile-app skeleton (coder never wrote output).
> Assessment below describes what the skeleton installed — not the Product Identity Contract's effect.

| Check | Result | Detail |
|---|---|---|
| First viewport app name | ✗ FAIL | `APP_CONFIG.name = 'AppName'` — not replaced |
| First viewport tagline | ✗ FAIL | `'A short, calm space to make consistent progress.'` — wellness generic |
| First h1 label | ✗ FAIL | `"Today's space"` — generic skeleton default |
| KPI labels | N/A | No KPI screen in mobile-app skeleton |
| Data/table/list labels | ✗ FAIL | Seed data: `Morning intention`, `Deep work block`, `Movement break`, `Evening review`, `Wind down` — wellness/productivity theme, no cashflow domain |
| Mock data authenticity | ✗ FAIL | Seed entries have `kind: practice/focus/movement/reflection/rest` — not invoices, payments, clients |
| Navigation labels | ✗ FAIL | BottomTabs: `Home`, `Create`, `Progress`, `Profile` — all generic |
| Generic skeleton labels remaining | ✓ YES | Home, Create, Progress, Profile (navigation); "Today's space" (h1); "AppName" (brand) |
| Cashflow Guard-specific copy | ✗ NONE | No cashflow, invoice, payment, freelancer, клиент, доход anywhere in workspace |

---

## Workspace inspection

**Files present** (mobile-app skeleton — pre-coder):
- `src/App.tsx`, `src/main.tsx`  
- Pages: `Home.tsx`, `Create.tsx`, `Detail.tsx`, `Onboarding.tsx`, `Profile.tsx`, `Progress.tsx`  
- Components: `BottomTabs.tsx`, `EmptyState.tsx`, `ErrorBoundary.tsx`, `LoadingScreen.tsx`, `PaywallSheet.tsx`
- Config: `app.ts`, `navigation.ts`, `routes.ts`, `theme.ts`
- Data: `seed.ts`, `types.ts`

| Check | Result | Detail |
|---|---|---|
| Missing imports/components | ✗ NONE FOUND | All skeleton imports resolve |
| PRODUCT token status | ✓ TOKENS PRESENT | `app.ts`: `PRODUCT: rewrite`; `navigation.ts`: `PRODUCT: agent may rebind`; `Home.tsx`: `PRODUCT: replace with greeting`; `Onboarding.tsx`: `PRODUCT: replace with value-prop` |
| SEED token status | ✓ TOKENS PRESENT | `seed.ts`: `SEED: replace with domain-specific entities`; `types.ts`: `SEED: agent replaces with the real domain entity` |
| Empty array status | ✗ NONE | No empty arrays |
| Compile status | ⚠ SKELETON ONLY | Skeleton compiled and mounted (static_build_complete). Coder build not attempted. |
| App name | ✗ `'AppName'` | Not substituted |
| BottomTabs present | ✓ YES | Appropriate for mobile-app skeleton |
| BottomTabs misuse | ✓ NO MISUSE | mobile-app skeleton, BottomTabs is correct nav pattern |
| UI quality notes | Skeleton quality | Clean mobile-app scaffold, correct structure, but zero product identity |

---

## Conclusion

**Did Product Identity Substitution Contract improve product-specific UI?**  
Cannot confirm — the coder hit HTTP 546 before writing any output. The contract IS included in the prompt (context_contract_chars jumped from 560 → 1384). Whether the model would have honored it is unknown from this run.

**Did coder complete?**  
**NO.** HTTP 546 (`proxy_resource_limit`) after 150 s. No retry was used. Coder output was not written.

**Did preview compile?**  
The skeleton preview compiled successfully (proto_pipeline_complete, iframe-mounted, candidate_promoted). The final coder preview was never triggered.

**Is remaining bottleneck product identity, visual quality, data authenticity, repair, compile, or model reliability?**  
**Model reliability / HTTP 546.** The coder (xiaomi/mimo-v2-pro) is being killed by OpenRouter's proxy resource limit at ~150 s. This is the same root cause as the previous skeleton-contract run but with a different model path. The Product Identity Substitution Contract is reachable — it is in the prompt — but the model's inference is being terminated by the proxy before a response is received.

---

## Recommended next implementation step

**Switch `agent_build` model to a model that does not hit HTTP 546 at this token/time budget.**  

The coder is using `xiaomi/mimo-v2-pro` with `coder_app maxTokens: 35256`. This model was being killed at ~150 s of inference on a ~57 000-char planning context. The previous successful run (skeleton contract, final status: success) used `openai/gpt-4o-mini` on the coder slot (as shown in the previous telemetry: `runtimeOverrideModelId: openai/gpt-4o-mini`).

**Concrete step:** Reset `agent_build.modelId` back to `openai/gpt-4o-mini` or verify whether the runtime override is still active. Re-run the Cashflow Guard observation to confirm: (1) coder completes, (2) Product Identity Contract is honored in the coder output, (3) workspace files contain cashflow-specific copy.

---

## Appendix — Console log evidence (key lines)

```
[coder_prompt_block_sizes] context_contract_chars: 1384  skeleton_contract_chars: 1228
[llm_call_diag] llm_call_step: coder  model_id: xiaomi/mimo-v2-pro  route_authority: backend_runtime_saved
[llm_transport] llm_call_step: coder  llm_http_status: 546  llm_error_category: proxy_resource_limit  llm_retry_used: false  llm_final_status: failed
[llm_call_outcome] llm_call_step: coder  response_time_ms: 150597  final_status: failed  http_status: 546
[preview-timeline] generation_preview_ownership_released
```
