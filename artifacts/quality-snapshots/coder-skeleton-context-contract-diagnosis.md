# Coder Skeleton Context Contract Diagnosis

Branch: `p2/coder-skeleton-context-contract`
Date: 2025-07-19

---

## Summary verdict

**PASS**

The coder prompt was already NOT sending raw skeleton source code. The real architectural
problem was that the coder received hardcoded mobile-app-specific navigation rules applied
universally to ALL skeletons. This is now fixed with a compact per-skeleton contract.

---

## What was found

### Raw skeleton source in coder prompt?
**No.** `buildSkeletonPromptBlock` (SkeletonRegistry.ts:1541) already excludes raw file
contents — it emits file paths grouped into working groups (~600 tokens, no source code).
`SKELETON_APP_RAW_MODULES` loads App.tsx raw content but is used only post-coder for
`ensureVisualPackImport` (visual pack injection), never in the coder prompt.

### Skeleton installed before coder?
**Yes.** The existing `skeletonPromptBlock` already states "SKELETON ALREADY INSTALLED"
and lists installed file paths. The skeleton installation step runs before `runCoder` in
the pipeline orchestration.

### Real problem found: hardcoded mobile-only navigation rules
Lines 2765–2775 in the old `runCoder` system prompt contained hardcoded navigation import
rules that were wrong for all non-mobile-app skeletons:

**Old (wrong for saas-dashboard):**
```
From '@/components/BottomTabs'  (NOT from ui): BottomTabs
From '@/config/navigation': BOTTOM_TABS (read-only; do NOT re-import or re-export)
CRITICAL: config/navigation.ts MUST export BOTTOM_TABS...
          config/routes.ts MUST export ROUTES with home/create/detail/progress/profile keys.
```

**Impact on saas-dashboard:**
- saas-dashboard uses `Sidebar` (not `BottomTabs`) as the primary nav component
- saas-dashboard has `SIDEBAR_NAV: readonly NavGroup[]` as the primary nav export
- saas-dashboard ROUTES keys are `dashboard`, `data`, `settings` (not `home/create/detail/progress/profile`)
- The coder was receiving structurally incorrect navigation contracts for non-mobile skeletons

### Coder prompt block sizes
No pre-existing baseline to compare against — diagnostics were added in this branch.
Post-change, `measureCoderPromptBlockSizes` will emit `[coder_prompt_block_sizes]` to
console before each LLM call with char counts per block. The skeleton contract block
is ~400–600 chars (structural only), replacing ~400 chars of incorrect hardcoded rules.
Net change: ~neutral on total size, with correctness improvement.

---

## What changed

### New: `frontend/src/services/SkeletonContractForCoder.ts`
- `buildSkeletonContractForCoder(skeletonId)` — compact per-skeleton contract builder
- `getSkeletonNavContract(skeletonId)` — exported for tests
- `NAV_CONTRACTS` table — covers all 14 registered SkeletonId values
- **saas-dashboard**: SIDEBAR_NAV + BOTTOM_TABS exports, Sidebar component, dashboard/data/settings routes
- **mobile-app**: BOTTOM_TABS export, BottomTabs component, home/create/detail/progress/profile routes
- **landing-page**: anchor-scroll nav mode, no tab/sidebar component
- **9 bottom-tabs skeletons**: BOTTOM_TABS export, BottomTabs component
- **3 sidebar skeletons (b2b, creator, productivity)**: SIDEBAR_NAV export, Sidebar component
- Contract includes: installed foundation statement, navigation config exports, import rules
- Does NOT include raw file source (structural contract only, ~400–600 chars)

### New: `frontend/src/services/CoderPromptBlockSizeDiagnostics.ts`
- `measureCoderPromptBlockSizes(input)` — pure char count measurement, no content logged
- `recordCoderPromptBlockSizes(sizes)` — safe `console.log` before LLM call
- Tracks: skeleton header, contract block, planning blocks, skeleton foundation, skeleton contract,
  file plan, output format, import rules, rules block, total system, user message, estimated tokens

### Modified: `frontend/src/services/ProtoPipeline.ts`
- Added imports: `buildSkeletonContractForCoder`, `measureCoderPromptBlockSizes`, `recordCoderPromptBlockSizes`
- Added `export const CODER_MAX_TOKENS = STEP_BUDGET.coder.maxTokens` (35000) — proves output budget unchanged
- `runCoder` system prompt rebuilt as named sub-blocks for diagnostics:
  `skeletonHeaderBlock`, `filePlanBlock`, `outputFormatBlock`, `importRulesBlock`, `rulesBlock`
- `importRulesBlock` now ends with `${skeletonContractBlock}` (per-skeleton nav contract)
- Removed hardcoded mobile-only BottomTabs, BOTTOM_TABS, and routes lines from all skeleton prompts
- Universal component imports kept: EmptyState, LoadingScreen, ErrorBoundary, lucide-react, ROUTES
- Added `measureCoderPromptBlockSizes` + `recordCoderPromptBlockSizes` calls before `streamCall`
- `buildSkeletonContractForCoder(input.skeletonId)` built once before system prompt assembly

### New: `frontend/src/services/__tests__/SkeletonContractForCoder.test.ts`
38 deterministic tests — no real LLM calls:
- Foundation statement: ALREADY INSTALLED, delta-only generation
- saas-dashboard: SIDEBAR_NAV, BOTTOM_TABS, Sidebar component, dashboard/data/settings routes
- mobile-app: BOTTOM_TABS, BottomTabs component, home/create/detail/progress/profile routes
- landing-page: anchor-scroll, no BottomTabs/Sidebar
- Import rules: import-from-listed, self-implement-if-absent, do-not-recreate-shell
- Contract size: all skeletons < 2000 chars (structural only, no raw source)
- CODER_MAX_TOKENS === 35000 (output budget unchanged)
- Product Assembly Plan preserved in buildCoderPlanningBlocks
- All 14 skeleton IDs covered in NAV_CONTRACTS

### Preserved (unchanged)
- `STEP_BUDGET.coder.maxTokens = 35_000` — NOT lowered
- `buildSkeletonPromptBlock` — still present (provides installed-files list to coder)
- `buildCoderPlanningBlocks` — all planning blocks preserved (Product Assembly Plan, market brief, etc.)
- `runArchitect` — unchanged, still downscoped as product strategist
- Quality gate, repair, preview pipeline, blueprint packaging — all unchanged
- `backend/agent-config.json` — NOT modified
- DeepSeek model — NOT replaced

---

## Why this is safer than lowering maxTokens

**Output budget remains available for complete code.**
`coder.maxTokens = 35_000` is preserved. Lowering it would risk truncating generated files,
causing incomplete components, broken imports, and the retry/repair cycle firing more often.
The HTTP 546 proxy_resource_limit error suggests an INPUT payload ceiling, not an output issue.

**Input payload is reduced (or corrected).**
The compact skeleton contract (~400–600 chars) replaces hardcoded mobile-specific navigation
rules that were incorrectly applied to all 14 skeletons. For non-mobile-app skeletons like
saas-dashboard, this removes structurally incorrect instructions that could confuse the coder
into generating wrong navigation structure, potentially causing downstream failures.

**Skeleton remains the foundation.**
The contract explicitly states the skeleton is ALREADY INSTALLED, instructs the coder to
generate ONLY app-specific delta files, and forbids recreating the app shell, router, or
providers. This preserves the intended delta-generation architecture.

**Coder still owns app-specific implementation.**
Product Assembly Plan, market-aware brief, planning blocks, and architecture ownership
instructions are all preserved. The skeleton contract only adds structural clarity about
what navigation config the coder can rely on — it does not prescribe implementation.

**Prompt block size diagnostics now available.**
`[coder_prompt_block_sizes]` is logged before each coder LLM call with char counts per block
and estimated token count. This enables targeted optimization of specific blocks if needed.

---

## Recommended next step

**Investigate Supabase proxy streaming limits.**

The HTTP 546 `proxy_resource_limit` error fires on the FIRST coder call, before any
retry. The prompt payload is not the only possible cause — Supabase Edge Functions have
streaming response limits and connection timeout constraints. The next diagnostic step
is to capture the full error context (headers, response body, timing) from a live
Cashflow Guard generation run to determine whether 546 is triggered by input size,
output streaming duration, or a connection limit on the proxy layer. The prompt block
size diagnostics now in place will provide the input size evidence for that investigation.
