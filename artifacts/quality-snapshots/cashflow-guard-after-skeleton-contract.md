# Cashflow Guard After Skeleton Contract

**Idea:** Cashflow Guard для фрилансеров  
**Branch:** p2/coder-skeleton-context-contract  
**Commit:** 3685230 — feat(coder): replace hardcoded mobile nav rules with per-skeleton contract  
**Run date:** 2026-05-26  
**Observation window:** 10 minutes (completed at ~137 s)

---

## Summary verdict

**PARTIAL**

Technical pipeline succeeded for the first time on this idea path: preview compiled, navigation correct, no import failures, no PRODUCT tokens, no HTTP 546. The skeleton-aware navigation contract fix eliminated the wrong mobile-only nav assumption. However, the coder output is generic saas-dashboard boilerplate (Pipeline / Records / B2B ops) with no Cashflow Guard product identity — the product-specific content (cashflow forecasting, freelancer invoices, receivables, AI prediction) was not expressed.

---

## Route authority

| Field | Value |
|---|---|
| provider | openrouter |
| modelId (runtime) | openai/gpt-4o-mini |
| modelId (static) | xiaomi/mimo-v2-pro |
| sourceAuthority | user_set |
| endpointKind | openrouter |
| maxTokens coder_app | 35,256 |
| backend health provider | claude (Claude Code CLI) |

**Note:** Runtime config overrides static. Generation used openrouter/gpt-4o-mini confirmed by 7× HTTP 200 to `openrouter.ai/api/v1/chat/completions`. Backend `/chat` returned 503/500 during packaging (normal retry pattern — pipeline eventually progressed through openrouter).

---

## Skeleton contract

| Field | Observed |
|---|---|
| Selected skeleton | saas-dashboard (inferred: Sidebar, 7 pages, KPICard, RecordTable, no BottomTabs) |
| nav mode | dashboard/sidebar |
| skeleton_contract_chars | **1,210** (SkeletonContractForCoder emitted ✓) |
| skeleton_foundation_chars | 4,167 |
| skeleton_header_chars | 394 |
| Mobile-only nav rules applied to saas-dashboard | **NO** ✓ |
| Contract matched skeleton type | **YES** ✓ |

---

## Pipeline timeline

| Stage | Result |
|---|---|
| Packaging / Дизайн-пак | ✓ complete (~60 s — multiple 503 retries normal) |
| Architect / Архитектура | ✓ complete (~76 s) |
| Skeleton selection | ✓ complete (~91 s) |
| Coder / Кодирование | ✓ complete (~121–137 s) |
| Quality gate | not observed in backend.log (logs go to stdout) |
| Repair | not observed |
| Preview compile | ✓ HTTP 200 on `/api/preview/.../compile` and assets |
| Live preview | ✓ loaded (white_screen_check inconclusive — probe timed out) |

**Total wall time:** ~137 s  
**HTTP 546:** not observed  
**proxy_resource_limit:** not observed

---

## Prompt / block diagnostics

Source: `[coder_prompt_block_sizes]` from browser console at ~91 s.

| Block | Chars | Approx tokens |
|---|---|---|
| skeleton_header | 394 | ~99 |
| context_contract | 560 | ~140 |
| skeleton_foundation | 4,167 | ~1,042 |
| skeleton_contract (new fix) | **1,210** | **~303** |
| planning_blocks (market brief + PAP) | **48,100** | **~12,025** |
| **Estimated total input** | **~54,431** | **~13,609** |

The planning_blocks block at 48,100 chars is the dominant block — it contains the market-aware brief and Product Assembly Plan. Total estimated input (~13,600 tokens) is well within the 35,256 token output budget.

---

## Workspace inspection

| Check | Result |
|---|---|
| Dashboard.tsx exists | ✓ yes (6 lines, compact single-line JSX) |
| App.tsx uses Sidebar | ✓ **yes** |
| App.tsx uses BottomTabs | ✗ **no** |
| BottomTabs.tsx in components | ✗ **no** |
| KPICard.tsx self-implemented | ✓ **yes** (coder created it) |
| Missing import errors | none observed |
| PRODUCT tokens (bare) | **0** ✓ |
| Empty `[]` arrays in Dashboard | **0** ✓ |
| Preview compile status | ✓ success |
| Cashflow Guard-specific content | **NOT FOUND** |

### Navigation correctness
App.tsx correctly uses `<Sidebar>` navigation with 7 named pages (Dashboard, Records, RecordDetail, Workflow, Team, Reports, Settings). This is proper saas-dashboard structure. No BottomTabs anywhere in the workspace.

### Missing imports / components
None. KPICard and RecordTable were self-implemented by the coder, not referenced from missing external packages.

### PRODUCT token status
Zero bare PRODUCT tokens found in any `.tsx` file.

### Content quality
The generated output is the generic **B2B ops saas-dashboard skeleton** — "Operations cockpit", "Pipeline health, records and workflow". KPI labels: Pipeline (pipeline value), Open records, Avg health. No cashflow forecasting, no freelancer invoices, no receivables prediction, no AI cashflow signal — none of the Cashflow Guard product identity is expressed.

```
Dashboard title: "Pipeline health, records and workflow in one surface."
KPIs: Pipeline ($Xk), Open records, Avg health
Sections: Priority records → RecordTable
Pages: Dashboard / Records / RecordDetail / Workflow / Team / Reports / Settings
```

This is the skeleton default content, not the product.

### Compile status
Preview compiled successfully. Assets served (JS + CSS bundles 200 OK). White-screen probe timed out (inconclusive — probe may have fired before iframe hydrated).

---

## Conclusion

### Did skeleton-aware contract fix the wrong mobile navigation assumption?
**Yes.** The previous hardcoded rules forced BottomTabs/BOTTOM_TABS on all skeletons including saas-dashboard. With SkeletonContractForCoder (1,210 chars), the contract correctly matched the saas-dashboard type: App.tsx uses Sidebar, no BottomTabs exist in the workspace.

### Did coder complete?
**Yes.** Coder completed within 137 s total. No HTTP 546. No proxy_resource_limit.

### Did HTTP 546 remain?
**No.** Not observed in this run.

### Is the remaining bottleneck contract correctness, DeepSeek/proxy reliability, coder output, repair, compile, or visual quality?
**Coder output / product content substitution.** The pipeline is technically healthy (compile ✓, nav ✓, no missing components, no PRODUCT tokens). The bottleneck is that the coder produces correct skeleton scaffold code but does not replace the skeleton's generic content with the product-specific identity from the planning_blocks brief. The 48,100-char planning block is processed but the coder (gpt-4o-mini) does not apply its content to rename pages, KPIs, data models, or copy to reflect "Cashflow Guard для фрилансеров".

---

## Recommended next implementation step

**Add an explicit content-replacement pass or enforce product identity substitution in the coder prompt.**

The coder prompt currently has the planning_blocks (market brief + Product Assembly Plan) as the largest block, but gpt-4o-mini defaults to filling out the skeleton scaffold with its generic defaults rather than applying the brief. The next step is to add a mandatory "product identity substitution" rule to the coder system prompt — specifically: every page title, KPI label, data field name, and placeholder copy must come from the Product Assembly Plan, not from the skeleton defaults. If needed, a post-coder identity-repair pass could scan for generic skeleton labels (Pipeline, Records, Lead, Qualified) and replace them with product-specific equivalents from the brief.

---

## Screenshots

| File | Contents |
|---|---|
| `screenshots/cashflow-guard-contract/01-app-loaded.png` | App loaded (login screen) |
| `screenshots/cashflow-guard-contract/01b-after-login.png` | After test login |
| `screenshots/cashflow-guard-contract/02-trend-panel.png` | Trending niches panel |
| `screenshots/cashflow-guard-contract/04-before-launch.png` | Cashflow Guard card before click |
| `screenshots/cashflow-guard-contract/05-packaging-started.png` | Packaging started |
| `screenshots/cashflow-guard-contract/06-engine-opened.png` | Engine opened |
| `screenshots/cashflow-guard-contract/obs-0060s.png` | At 60 s — Architect in progress |
| `screenshots/cashflow-guard-contract/obs-0121s.png` | At 121 s — Coder in progress (83%) |
| `screenshots/cashflow-guard-contract/final-success.png` | Final state — SUCCESS |
