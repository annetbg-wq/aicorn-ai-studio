# WL-0R — Recovery Preflight / Diff Classification

Main diff used for this report: `artifacts/quality-snapshots/WL-0/all-changes-with-untracked.patch`

`all-changes-with-untracked.patch` already exists, so WL-0R used it as the authoritative mixed diff instead of regenerating a new one.

## WL-0 status

`WL-0 clean preflight = FAIL`

Reason: implementation changes, new source files, test changes, preview-workspace prototype residue, and generated artifacts were all mixed into what should have been a no-code preflight audit.

## Git state

- Current branch: `p2/generation-path-persistence-shelved`
- `git diff --cached --name-status`: empty
- Interpretation: there is no staged content; current `A` paths are worktree additions exposed through intent-to-add/untracked capture.
- Modified files:
  - `backend/preview-manager.test.ts`
  - `backend/preview-manager.ts`
  - `frontend/src/hooks/useStudio.ts`
  - `frontend/src/services/GenerationEngine.ts`
  - `frontend/src/services/LiveGenerationUiPrimitives.ts`
  - `frontend/src/services/ProjectStorage.ts`
  - `frontend/src/services/ProtoPipeline.ts`
  - `frontend/src/services/__tests__/LiveGenerationContractValidator.test.ts`
  - `frontend/src/services/__tests__/ProtoPipeline.test.ts`
  - `preview-workspace/tsconfig.json`
- Added/untracked source-like files in the main diff:
  - `frontend/src/components/ui/alert.tsx`
  - `frontend/src/services/CompletenessGate.ts`
  - `frontend/src/services/DocumentationPackService.ts`
  - `frontend/src/services/LVPipeline.ts`
  - `frontend/src/services/ProductDocumentSet.ts`
  - `frontend/src/services/__tests__/CompletenessGate.test.ts`
  - `frontend/src/services/__tests__/LVPipeline.test.ts`
  - `frontend/src/services/__tests__/ProductDocumentSet.test.ts`
  - `preview-workspace/src/components/BottomTabs.tsx`
  - `preview-workspace/src/components/RitualCard.tsx`
  - `preview-workspace/src/components/ui/label.tsx`
  - `preview-workspace/src/components/ui/switch.tsx`
  - `preview-workspace/src/design-pack/premium-components/health/premium-health-calm-insight-01/component.tsx`
  - `preview-workspace/src/design-pack/premium-components/health/premium-health-routine-card-01/component.tsx`
  - `preview-workspace/src/design-pack/premium-components/mobile/premium-mobile-bottom-nav-01/component.tsx`
  - `preview-workspace/src/hooks/useCategories.ts`
  - `preview-workspace/src/hooks/useHabits.ts`
  - `preview-workspace/src/hooks/useRituals.ts`
- Deleted files in the current diff: none
- Generated artifact files already present under `artifacts/quality-snapshots/WL-0/`:
  - `all-changes-with-untracked.patch`
  - `all-changes.patch`
  - `diff-GenerationEngine.patch`
  - `diff-LiveGenerationUiPrimitives.patch`
  - `diff-preview-manager-test.patch`
  - `diff-preview-manager.patch`
  - `diff-ProjectStorage.patch`
  - `diff-ProtoPipeline.patch`
  - `diff-useStudio.patch`
  - `diff-stat.txt`
  - `git-status.txt`
  - `name-status.txt`
  - `untracked.txt`
  - `untracked-source-files.txt`
- `dialog-after-brief.png`: restored/present, tracked, no active diff
- `backend/agent-config.json`: no current diff
- `backend/agent-config.json` content note: the file still contains hardcoded defaults in repo baseline, but WL-0R found no new delta in this mixed diff, so it is not a current-diff blocker.

Full per-file classification is recorded in [file-map.json](/c:/ai_studio/artifacts/quality-snapshots/WL-0/file-map.json).

## WI grouping summary

- `WI-1`: exact-case UI primitive materialization check inside `backend/preview-manager.ts` plus one backend test hunk
- `WI-2`: `ProductDocumentSet.ts`, `GenerationEngine.ts` prebuiltPlan plumbing, PDS-related hunks inside `ProtoPipeline.ts`, `ProductDocumentSet.test.ts`
- `WI-3`: `CompletenessGate.ts`, completeness-related hunks inside `ProtoPipeline.ts`, `CompletenessGate.test.ts`
- `WI-4`: Pass 2 critic/implementer hunks inside `ProtoPipeline.ts`
- `WI-5`: `frontend/src/components/ui/alert.tsx`, `LiveGenerationUiPrimitives.ts`, `LiveGenerationContractValidator.test.ts`, `ProtoPipeline.test.ts`
- `WI-6`: `LVPipeline.ts`, `useStudio.ts` blank_canvas routing, `ProjectStorage.ts` generationPath persistence, `LVPipeline.test.ts`
- `WI-7`: uploaded-asset/design-fusion hunks inside `ProtoPipeline.ts`
- `WI-8`: screenshot handshake hunk inside `backend/preview-manager.ts` plus one backend test hunk
- `preview-repair`: preview-workspace RitualFlow files
- `unrelated`: `DocumentationPackService.ts`, `preview-workspace/tsconfig.json`, generated artifact files

## ProtoPipeline split

### PDS creation / persistence

- Current loci:
  - imports at lines `147-148`
  - `prebuiltPlan?: ProjectPlan` at line `406`
  - `collectRequiredCapabilityIds()` at `1040-1049`
  - `mergeSavedPlanRequirements()` at `1051-1114`
  - architect-plan merge call at `2079`
  - `materializeProductDocumentSet(...)` call at `2252-2269`
  - `Object.assign(filteredFiles, productDocumentSet.files)` at `2557`
- WI: `WI-2`
- Can separate into its own patch: `yes`, but not by taking all current `ProtoPipeline.ts` changes wholesale; only the PDS-related hunks plus `GenerationEngine.ts` support should move together.
- Required proof/gate:
  - `ProductDocumentSet.test.ts`
  - integration proof that PDS is persisted beyond generated `docs/architect/*`
  - project snapshot/run report assertion

Assessment: helper creation exists, but persistence is currently only via generated files merged into `filteredFiles`. There is no structured `ProjectStorage` or run-report persistence for PDS, so WI-2 is incomplete as currently implemented.

### Completeness gate

- Current loci:
  - import at line `148`
  - `filterCompletenessFiles()` at `1303-1312`
  - gate invocation at `2542-2556`
- WI: `WI-3`
- Can separate into its own patch: `yes`, after removing Pass 2, PDS, and uploaded-asset hunks.
- Required proof/gate:
  - `CompletenessGate.test.ts`
  - negative integration test where a required page file exists but is effectively empty/stubbed
  - must-capability miss should block

Assessment: capability-signal checking exists, which is good. But current implementation treats a page file as covered when the file path exists; it does not prove that the page is actually implemented.

### Pass 2 critic -> implementer

- Current loci:
  - `buildCriticFileDigest()` at `1116-1140`
  - `runPassTwoCritic()` at `1142-1228`
  - `runPassTwoImplementer()` at `1230-1301`
  - runtime call sites at `2506-2539`
- WI: `WI-4`
- Can separate into its own patch: `yes`, but it must be carved out of the mixed `ProtoPipeline.ts` diff.
- Required proof/gate:
  - dedicated unit tests for critic payload shape
  - dedicated unit tests for allowed file patch scope
  - integration telemetry proving critic verdict + implementer touched paths

Assessment: current critic returns `{ verdict, reasons, instructions, focusFiles }`, not a strict `Gap[]` contract. The patch-scoping guard is present, but the critic schema is looser than requested.

### Asset / design fusion

- Current loci:
  - `materializeUploadedAssetFusion()` at `949-1038`
  - call site at `2004-2009`
  - architect prompt injection via `attachmentPromptBlock` at `2073`
  - coder prompt plumbing at `3032`, `3112`, `3311-3395`
  - file materialization at `2403`
- WI: `WI-7`
- Can separate into its own patch: `yes`, after excluding PDS/completeness/Pass 2 hunks.
- Required proof/gate:
  - dedicated tests for uploaded asset materialization
  - prompt evidence snapshot
  - generated file manifest assertion
  - explicit vision-unavailable telemetry, which is currently absent

Assessment: uploaded assets are turned into generated modules and prompt hints, but there is no WI-specific gate yet, and no explicit `critic_vision_blind` / `visionUnavailableReason` telemetry.

### LVPipeline / routing integration inside ProtoPipeline

- Current loci: none
- WI: not applicable inside `ProtoPipeline.ts`
- Can separate into its own patch: routing actually lives in `useStudio.ts`, `LVPipeline.ts`, and `ProjectStorage.ts`
- Required proof/gate: Batch 5 route-selection gate

Assessment: `ProtoPipeline.ts` itself does not own the blank_canvas routing decision.

### Telemetry / reporting

- Current loci:
  - new logs around `[attachments]`, `[docs]`, `[pass-2]`, `[completeness]`
- WI: mixed support logic, not a standalone WI
- Can separate into its own patch: mostly no; these logs are intertwined with the feature hunks they describe.
- Required proof/gate: per-WI gate snapshots, not log lines alone

Assessment: helpful logs were added, but no dedicated per-WI gate artifact was introduced.

### Unrelated / refactor

- Current loci:
  - no obvious pure refactor block; the problem is feature mixing, not a standalone cleanup refactor
- WI: `unknown`
- Can separate into its own patch: only by manually re-splitting the file by concern
- Required proof/gate: per-batch patch extraction review

## Invariant checks

| Check | Yes/No | Note |
|---|---|---|
| generationPath values not renamed (`skeleton_assembly`, `blank_canvas`) | Yes | The exact values are still present in `useStudioGenerationPath.ts`, `useStudio.ts`, `ProjectStorage.ts`, and `LVPipeline.ts`. |
| `skeleton_assembly` really routes to ProtoPipeline | Yes | Non-blank-canvas path still runs through `GenerationEngine.run()` -> `ProtoPipeline.run()`. |
| `blank_canvas` really routes to LVPipeline | Yes | `useStudio.ts` routes to `LVPipeline` when `generationPath === 'blank_canvas'` and `existingCodeCount === 0`. |
| AUTO/APP/SUPER do not choose pipeline | Yes | `generationMode` is not used to choose `GenerationEngine` vs `LVPipeline`; `generationPath` is. |
| ProductDocumentSet is saved in project snapshot/run report, not only in generated `src/docs/architect/*` | No | Current implementation only merges docs into generated files. |
| PDS is passed into ProtoPipeline coder prompt | No | There is no PDS prompt block; only uploaded-asset prompt blocks were added. |
| PDS is passed into LVPipeline generate prompt | No | `LVPipeline` strips `prebuiltPlan` and simply delegates to `GenerationEngine`. |
| Completeness gate does not count an empty page file as implemented | No | Current helper checks file presence, not meaningful content. |
| Completeness gate checks more than file existence and also evaluates must-capabilities/signals | Yes | Capability signals are checked via regex corpus rules. |
| Partial outcome is not counted as GATE PASS | No | There is still no per-WI gate artifact; compile success is not equivalent to WI acceptance. |
| Pass 2 critic returns strict `Gap[]` | No | Current contract is `{ verdict, reasons, instructions, focusFiles }`. |
| Pass 2 implementer patches only allowed target files | Yes | It filters to `currentFiles` or allowed delta paths. |
| Alert is available in generated/preview workspace, not only in frontend UI | Yes | `Alert` is in the canonical allowed primitive list and can be materialized by `preview-manager` from the canonical root. |
| Direct imports from `@radix-ui/react-*` are forbidden in generated pages | No | There is prompt guidance, but no hard validator/back-end enforcement for this invariant. |
| Screenshot failure is not counted as visual pass | No | Screenshot capture was added, but its failure is not wired into a visual acceptance gate. |
| `critic_vision_blind` / `visionUnavailableReason` are written explicitly | No | No such fields were found. |
| `backend/agent-config.json` did not receive new hardcoded provider/model defaults | Yes | For the current diff only: the file has no delta. |

## Preview-workspace classification

### A) factory scaffold / materialization requirement

- None of the current `preview-workspace/*` additions should be accepted directly as factory-core evidence.
- If the factory needs lowercase `label`/`switch` or premium-component materialization, that should be implemented from canonical sources (`frontend/src/components/ui`, skeleton roots, preview-manager materializer) rather than by committing the live preview workspace residue.

### B) concrete RitualFlow repair from Time 2

- `preview-workspace/src/components/BottomTabs.tsx`
- `preview-workspace/src/components/RitualCard.tsx`
- `preview-workspace/src/hooks/useRituals.ts`
- `preview-workspace/src/hooks/useHabits.ts`
- `preview-workspace/src/hooks/useCategories.ts`
- `preview-workspace/src/design-pack/premium-components/health/premium-health-calm-insight-01/component.tsx`
- `preview-workspace/src/design-pack/premium-components/health/premium-health-routine-card-01/component.tsx`
- `preview-workspace/src/design-pack/premium-components/mobile/premium-mobile-bottom-nav-01/component.tsx`
- `preview-workspace/src/components/ui/label.tsx`
- `preview-workspace/src/components/ui/switch.tsx`

Reason: these files are RitualFlow/health-specific in naming, copy, storage keys, and visual direction. They should not be committed together with studio-core WI patches.

### C) unrelated / generated noise

- `preview-workspace/tsconfig.json`

Reason: changing `forceConsistentCasingInFileNames` to `false` weakens the very parity guarantee that WI-1 is supposed to strengthen.

## Recovery conclusion

Current implementation changes are `partially salvageable`.

Salvageable:
- `WI-1 + WI-5` with hunk-splitting
- `WI-6` with its own route-selection gate
- portions of `WI-2`, `WI-3`, `WI-4`, `WI-7`, `WI-8` after separation

Unsafe to accept as-is:
- mixed `ProtoPipeline.ts`
- mixed `backend/preview-manager.ts`
- preview-workspace RitualFlow residue
- `preview-workspace/tsconfig.json`

## WL-0R verdict

- WL-0 clean preflight: FAIL
- Reason: implementation changes were mixed into preflight
- Current implementation changes: partially salvageable
- Next required action: accept/reject Batch 1 only after its own gate snapshot
