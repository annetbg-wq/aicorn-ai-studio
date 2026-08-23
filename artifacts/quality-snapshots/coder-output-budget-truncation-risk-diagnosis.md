# Coder Output Budget and Truncation Risk Diagnosis

Branch: `p2/diagnose-coder-output-budget-and-truncation-risk`
Source: `p2/diagnose-coder-payload-size-for-deepseek-546`

---

## Summary verdict

**PARTIAL** — Structural evidence is strong enough to rule out a blind
`maxTokens → 16 000` reduction as safe. No live run data exists to confirm
the _exact_ output size, but artifact-parser protections, retry behavior, and
skeleton delta-file counts together show that `35 000` is not arbitrary padding:
it is sized to accommodate the worst-case multi-file coder output. The safer
strategy is input-context compaction, not output-budget reduction.

---

## Why fixed maxTokens reduction is risky

Reducing `STEP_BUDGET.coder.maxTokens` from `35 000 → 16 000` would:

1. **Truncate multi-file output at stream time.**  
   The coder emits 7–11 `FILE/END` marker blocks for saas-dashboard through
   mobile-app skeletons. At ~3 000 chars/file (750 tokens/file) the output for
   11 files already needs ~8 250 output tokens _minimum_. Real files are often
   larger (300–500-line components). A 16 000-token limit leaves almost no
   headroom for high-complexity output.

2. **Trigger `finish_reason=length` → targeted retry.**  
   `runCoder` detects `firstReason === 'length'` and fires a second LLM call
   for the missing files. That second call hits the same `maxTokens=35 000`
   budget and re-uses the same Supabase proxy route — meaning the fix saves
   nothing on the 546 path but adds latency and a second payload to the proxy
   for every multi-file generation.

3. **Produce incomplete code that repair cannot fix.**  
   `runRepair` uses `maxTokens: 12 000` and repairs only files referenced in
   the error log. A truncated coder output (syntax-incomplete JSX, cut
   imports, missing closing braces) is unlikely to compile, and the repair step
   receives only fragments of the problem files with no awareness that the
   original generation was budget-truncated.

4. **The 546 error is a proxy resource limit, not a provider context-overflow.**  
   `classifyLlmHttpError` maps HTTP 546 to `proxy_resource_limit`, explicitly
   NOT `context_too_large`. Reducing output budget does not address CPU/memory
   resource limits on the Supabase Edge Function side; it only risks breaking
   the generated output.

---

## Evidence

### Current coder configuration

| Field | Value |
|-------|-------|
| `STEP_BUDGET.coder.maxTokens` | **35 000** |
| `STEP_BUDGET.coder.timeoutMs` | 360 000 ms (6 min) |
| `STEP_BUDGET.repair.maxTokens` | 12 000 |
| `STEP_BUDGET.qualityRepair.maxTokens` | 8 000 |

### Expected file counts per skeleton

| Skeleton | `deltaFiles` count |
|----------|-------------------|
| `saas-dashboard` | 7 |
| `mobile-app` | 11 |
| `b2b-operations-workspace` | 11 |
| `marketplace-platform` | 10 |
| `content-learning-app` | 11 |

### Estimated minimum output token needs

| Files | @750 tok/file | @1 500 tok/file (larger components) |
|-------|--------------|--------------------------------------|
| 7 | 5 250 | 10 500 |
| 10 | 7 500 | 15 000 |
| 11 | 8 250 | 16 500 |

At the 1 500 tok/file estimate (realistic for 300-line TSX pages), 11 files
already hits 16 500 tokens — marginally over a 16 000 ceiling, leaving zero
slack for the retry path or repair.

### Artifact-parser truncation protections

`looksLikeTruncatedArtifact()` in `artifactParser.ts` detects JSON-envelope
truncation (stream cut mid-string, unbalanced braces).  
`runCoder` uses `FILE/END` marker format; truncation is detected via:
- `firstReason === 'length'` from `onFinishReason`
- `missing.length > 0` after `parseFileMarkers`

Both signals trigger the targeted retry — confirming the pipeline already
handles budget-truncation, but at the cost of a second API call that hits
the same proxy.

### `incompletefile` detection (new)

`detectIncompleteFile()` in `CoderOutputBudgetDiagnostics.ts` flags:
- Files < 50 chars
- Files containing `// rest of implementation` or `// TODO:`
- Files with imports but no `export` statement (cut before the exported symbol)

### Input-side verbose blocks (compaction candidates)

The `runCoder` system prompt assembles these blocks before the first API call:

| Block | Source | Notes |
|-------|--------|-------|
| `skeletonPromptBlock` | `buildSkeletonPromptBlock` | Skeleton-specific instructions, file trees, locked paths |
| `planningBlocks` | 5 sub-planners | designCtx, compositionPlan, functionalFlowPlan, skeletonIntegrationPlan, productSpecificityPlan |
| `marketAwareBuilderBrief` | `serializeMarketAwareBuilderBriefForCoder` | Product-specific brief; potentially duplicate with architect summary |
| `buildBuilderOwnedSelfPlanInstructions` | same brief | Second serialization of the same brief for coder self-plan |
| `uiPrimitiveImportCatalog` | `buildUiPrimitiveImportCatalog` | Can be large for full skeleton |
| `contractBlock` | skeleton.contextContract + architect contextContract | May be redundant if architect plan already embeds it |

These blocks are assembled sequentially with no deduplication. In the worst
case (complex product, full market brief, all 5 planner outputs) the system
prompt alone can reach 50 000–100 000 chars before `maxTokens` is added to
the payload.

**Compaction candidates identified (not yet removed):**
- `buildBuilderOwnedSelfPlanInstructions` may duplicate `serializeMarketAwareBuilderBriefForCoder`
- `skeletonPromptBlock` contains the full skeleton file tree AND locked-path list,
  which is also in `fileTreeBlock` / `fileList` further down the same system string
- `planningBlocks` sub-outputs (composition plan, functional flow) may repeat
  the same page/feature list that also appears in `pageList`

None of these are removed in this branch because they have no dedicated tests
that would confirm safe removal, and the task scope is diagnosis only.

### Missing evidence

- No live-run output: actual `outputCharCount` per skeleton is unknown.
- No proxy-side request body size for the full system + user + maxTokens
  payload (the existing `llmPayloadDiagnostics` diagnostics capture this
  post-serialization, but no live call has been made in this branch).
- The exact Supabase Edge Function memory/CPU limit that triggers 546 is
  not publicly documented.

---

## Safer strategy

**Keep `maxTokens` high, compact the input context.**

The evidence shows:
- `maxTokens=35 000` is sized for the output, not arbitrary.
- The 546 error is a _resource_ limit on the proxy, not a _context-overflow_
  on the model.
- The system prompt is the largest compaction opportunity: large overlapping
  blocks can be trimmed or deduplicated without touching the output budget.
- Input token reduction lowers total payload byte size, which is the primary
  driver of proxy-side resource consumption.

This aligns with **Option B** from the strategic comparison below.

### Strategic options comparison

| Option | Description | Risk |
|--------|-------------|------|
| **A** | Lower maxTokens fixed to 16 000 | **HIGH** — incomplete code for 10–11-file skeletons. Triggers retry that hits the same 546 path. |
| **B ✓** | Keep maxTokens high, compact input context (dedup planningBlocks, trim skeletonPromptBlock, remove redundant brief serializations) | **LOW** — output budget preserved; input size reduced; proxy load reduced. |
| **C** | Dynamic maxTokens based on `expectedFileCount * AVG_TOKENS_PER_FILE` | **MEDIUM** — potentially best long-term but requires calibration of per-file token estimates per skeleton; needs live data before implementation. |
| **D** | Split coder into smaller phases/files | **LOW** (quality risk) — bigger architecture change; outside this branch scope. |

---

## Recommended next implementation step

**Compact the coder system prompt input context (Option B).**

Specifically:
1. Deduplicate `buildBuilderOwnedSelfPlanInstructions` vs
   `serializeMarketAwareBuilderBriefForCoder` — they both serialize the same
   `MarketAwareBuilderBrief` object into the coder prompt.
2. Trim `skeletonPromptBlock` to exclude the locked-path list when it is already
   present as `fileTreeBlock` lower in the same prompt.
3. Add a `total_system_prompt_char_count` measurement to
   `recordLlmCallDiagnostics` to confirm that prompt reduction actually reduces
   the proxy payload byte size.

Implement as a separate branch (`p2/compact-coder-input-context`) with:
- Before/after char-count assertions in `ProtoPipelineDiagnostics.test.ts`
- No change to `maxTokens`, no change to skeleton manifests, no change to
  artifact parsing

---

## Diagnostics added in this branch

New module: `frontend/src/services/CoderOutputBudgetDiagnostics.ts`

Emits `[coder_output_budget_diag]` after every coder call with:

```
requested_max_tokens         35000
actual_output_char_count     <chars streamed>
parsed_file_count            <N>
expected_file_count          <N>
artifact_parse_status        ok | missing_files | parse_failed | retry_recovered
truncated_artifact_detected  false | true
incomplete_file_detected     false | true
missing_expected_files_count <N>
finish_reason                stop | length | unknown
output_budget_risk           adequate | too_low_risk | excessive_unknown
risk_level                   high_but_needed | probably_adequate | likely_too_low | inconclusive
risk_reasons                 [...]
```

No generated code, no prompt text, no secrets are logged.

---

## Test coverage

| Test file | Tests | Status |
|-----------|-------|--------|
| `coderOutputBudgetRisk.test.ts` (new) | 24 | ✅ pass |
| `artifactParser.test.ts` | existing | ✅ pass |
| `ProtoPipelineDiagnostics.test.ts` | existing | ✅ pass |
| `LlmTransportError.test.ts` | existing | ✅ pass |
| `llmPayloadDiagnostics.test.ts` | existing | ✅ pass |
| **Total** | **125** | ✅ all pass |
