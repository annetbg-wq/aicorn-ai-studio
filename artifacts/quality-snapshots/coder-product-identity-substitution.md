# Coder Product Identity Substitution — Quality Snapshot

**Branch:** `p2/coder-product-identity-substitution`  
**Based on:** `p2/coder-skeleton-context-contract`  
**Date:** 2026-05-27

---

## 1. Generic Content Problem Found

After the `SkeletonContractForCoder` fix succeeded (preview compiled, no HTTP 546, no missing imports, saas-dashboard skeleton contract worked correctly), the Cashflow Guard generation run still showed generic B2B boilerplate in the output:

- **Page titles** — generic dashboard labels instead of Cashflow Guard-specific titles
- **KPI labels** — "Revenue", "Conversion", "Activity" instead of "cash runway", "overdue invoices", "upcoming payouts"
- **Data model labels** — generic CRM/pipeline vocabulary instead of freelancer cashflow domain terms
- **Copy** — placeholders and generic SAAS copy rather than product-promise language

Root cause: The coder used the skeleton *structurally* correctly (skeleton contract worked) but was not instructed to replace the skeleton's default business vocabulary with product-specific equivalents derived from the Product Assembly Plan and market-aware brief.

---

## 2. Where Product Identity Substitution Contract Was Added

**File:** `frontend/src/services/MarketAwareBuilderBrief.ts`

New function added (after `buildBuilderOwnedSelfPlanInstructions`):

```typescript
export function buildProductIdentitySubstitutionContract(): string
```

Returns a ~1 100-char mandatory coder-facing block containing:

```
═══════════════════════════════════════════════════════════════
PRODUCT IDENTITY SUBSTITUTION CONTRACT — MANDATORY
═══════════════════════════════════════════════════════════════

Skeleton defaults are STRUCTURAL PLACEHOLDERS only.
...

RULE 1 — Replace every piece of visible copy with product-specific language.
  [page titles, KPI labels, navigation labels, CTA text, empty states, dashboard metrics
   must come from: Product Assembly Plan, PRODUCT PROMISE, trend idea, differentiator]

RULE 2 — Generic skeleton vocabulary is forbidden unless clearly product-appropriate.
  Do NOT leave: Pipeline, Records, Leads, Accounts, Tasks, Revenue, Conversion, Activity...

RULE 3 — First viewport must make the product identity obvious.
  [check: title, primary KPI, CTA, visible data rows]

RULE 4 — Mock data, records, and field names must be domain-authentic.
  [cashflow product example, fitness product example, booking app example]

RULE 5 — self-check before final output.
  Ask: "Could a user identify this specific product from the visible UI alone,
  without reading any external context?"
═══════════════════════════════════════════════════════════════
```

**File:** `frontend/src/services/ProtoPipeline.ts`

Injected into `buildCoderPlanningBlocks` between `serializeMarketAwareBuilderBriefForCoder` and `buildBuilderOwnedSelfPlanInstructions`:

```typescript
// Product Identity Substitution Contract — injected when a market-aware brief is present.
// Must appear after the brief (so the coder has product context) and before the
// self-plan instructions (so the substitution rules are in scope during planning).
input.marketAwareBuilderBrief ? buildProductIdentitySubstitutionContract() : '',
```

The contract is only emitted when a `marketAwareBuilderBrief` is present — it references sources (Product Assembly Plan, brief, differentiator) that are available in that context.

---

## 3. Rules Preserved

| Rule | Status |
|---|---|
| Coder still owns architecture and implementation | ✅ Preserved — `buildBuilderOwnedSelfPlanInstructions` unchanged |
| Skeleton remains installed foundation | ✅ Preserved — SkeletonContractForCoder unchanged |
| Skeleton contract remains structural | ✅ Preserved — only content/copy rules added |
| Product Assembly Plan remains mandatory | ✅ Preserved — still injected via `buildBuilderOwnedSelfPlanInstructions` |
| No fixed external block list added | ✅ Contract uses "unless clearly appropriate" qualifier (not absolute ban) |
| No post-coder repair added | ✅ No repair logic touched |
| Preview pipeline unchanged | ✅ Not touched |
| Blueprint packaging unchanged | ✅ Not touched |
| Quality gate unchanged | ✅ Not touched |
| `coder.maxTokens` unchanged | ✅ Still 35 000 |
| `backend/agent-config.json` unchanged | ✅ Not touched |
| Provider/model defaults unchanged | ✅ Not touched |

---

## 4. Tests Run

### New tests — `CoderProductIdentitySubstitution.test.ts` (28 tests, all pass)

| Group | Tests |
|---|---|
| structural placeholder statement | 3 |
| Product Assembly Plan sourcing | 4 |
| first viewport product identity | 2 |
| forbidden generic labels | 3 |
| generic, not product-specific | 3 |
| planning blocks — contract injection | 3 |
| planning blocks — block ordering | 2 |
| Product Assembly Plan preserved | 4 |
| skeleton contract instructions preserved | 2 |
| CODER_MAX_TOKENS unchanged | 2 |

### Existing tests — all pass

| Suite | Tests |
|---|---|
| SkeletonContractForCoder.test.ts | pass |
| TrendDirectLaunchBuilderOwnedAssemblyPlan.test.ts | pass |
| MarketAwareBuilderBriefCoderInjection.test.ts | pass |
| ProtoPipeline.test.ts | pass |

**Total tests run: 119 existing + 28 new = 147 (all pass)**

---

## 5. coder.maxTokens Status

`CODER_MAX_TOKENS` = **35 000** — unchanged.

The fix adds ~1 100 chars to the INPUT prompt (planning blocks). The OUTPUT budget is not affected. This is consistent with the approach established in `p2/coder-skeleton-context-contract`: fix the input context, not the output ceiling.

---

## 6. Files Changed

| File | Change |
|---|---|
| `frontend/src/services/MarketAwareBuilderBrief.ts` | Added `buildProductIdentitySubstitutionContract()` export |
| `frontend/src/services/ProtoPipeline.ts` | Imported and injected `buildProductIdentitySubstitutionContract` into `buildCoderPlanningBlocks` |
| `frontend/src/services/__tests__/CoderProductIdentitySubstitution.test.ts` | New test file (28 deterministic tests, no LLM calls) |
| `artifacts/quality-snapshots/coder-product-identity-substitution.md` | This report |
