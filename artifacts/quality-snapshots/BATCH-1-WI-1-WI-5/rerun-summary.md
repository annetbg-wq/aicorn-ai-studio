# Batch 1 Re-run Summary

Verdict: `PASS`

Base patch: `artifacts/quality-snapshots/BASELINE-GATE-UNBLOCK/baseline-unblock.patch`

Batch patch: `artifacts/quality-snapshots/BATCH-1-WI-1-WI-5/batch1.patch`

## Patch application

- `baseline-unblock.patch` applies cleanly to fresh `HEAD`
- `batch1.patch` applies cleanly on top of `baseline-unblock.patch`

## Included Batch 1 files

- `frontend/src/components/ui/alert.tsx`
- `frontend/src/services/LiveGenerationUiPrimitives.ts`
- `frontend/src/services/__tests__/LiveGenerationContractValidator.test.ts`
- `frontend/src/services/__tests__/ProtoPipeline.test.ts`
- exact-case hunk only from `backend/preview-manager.ts`
- exact-case regression hunk only from `backend/preview-manager.test.ts`

Baseline-only compatibility layer present underneath this rerun:

- `frontend/src/services/DocumentationPackService.ts`
- `frontend/src/services/ProjectStorage.ts`
- Supabase test-only isolation inside `frontend/src/services/__tests__/ProtoPipeline.test.ts`
- Supabase test-only isolation inside `frontend/src/services/__tests__/ProtoPipelineDiagnostics.test.ts`

These baseline-unblock changes were required for honest test execution, but they are not part of Batch 1 product scope.

## Excluded files and hunks

- screenshot hunk from `backend/preview-manager.ts`
- screenshot test hunk from `backend/preview-manager.test.ts`
- `frontend/src/services/ProtoPipeline.ts`
- `frontend/src/services/ProductDocumentSet.ts`
- `frontend/src/services/CompletenessGate.ts`
- `frontend/src/services/LVPipeline.ts`
- `frontend/src/hooks/useStudio.ts`
- `frontend/src/services/GenerationEngine.ts`
- all `preview-workspace/*`
- `preview-workspace/tsconfig.json`
- `backend/agent-config.json`

## Proof points

- Exact-case check is active in [backend/preview-manager.ts](/c:/ai_studio/backend/preview-manager.ts:587)
- Canonical lowercase regression is asserted in [backend/preview-manager.test.ts](/c:/ai_studio/backend/preview-manager.test.ts:185)
- Alert is added to the canonical primitive catalog in [frontend/src/services/LiveGenerationUiPrimitives.ts](/c:/ai_studio/frontend/src/services/LiveGenerationUiPrimitives.ts:3)
- Minimal baseline forces `Alert` advertising in [frontend/src/services/LiveGenerationUiPrimitives.ts](/c:/ai_studio/frontend/src/services/LiveGenerationUiPrimitives.ts:115)
- Exact import path is asserted in [frontend/src/services/__tests__/ProtoPipeline.test.ts](/c:/ai_studio/frontend/src/services/__tests__/ProtoPipeline.test.ts:108)
- Alert materialization into preview/generated workspace was re-proven with an isolated `ensureImportedUiPrimitives()` script

## Tests run

- `npm run typecheck --prefix frontend`
- `npm test --prefix frontend -- LiveGenerationContractValidator`
- `npm test --prefix frontend -- ProtoPipeline`
- `npx vitest run backend/preview-manager.test.ts -t "materializes canonical lowercase primitives even when a legacy PascalCase file already exists" --root <fresh worktree>`

## Outcome

Batch 1 is now gate-clean on top of BASELINE-GATE-UNBLOCK.

Recommended commit order:

1. `BASELINE-GATE-UNBLOCK`
2. `Batch 1 — WI-1/WI-5`

Do not combine them into one commit.
