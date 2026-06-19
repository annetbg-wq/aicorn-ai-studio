# WL-0R — Recovery Plan

Main diff source: `artifacts/quality-snapshots/WL-0/all-changes-with-untracked.patch`

## Recovery posture

- `WL-0 clean preflight = FAIL`
- Reason: implementation changes were mixed into a preflight that was supposed to be no-code.
- Current mixed diff status: `partially salvageable`
- Global rule: do not accept the current mixed worktree as one change set.
- Global rule: do not claim `WI-1..WI-8 PASS` from this snapshot.
- Global rule: every batch must produce its own gate snapshot before acceptance.

## Batch order

1. Batch 1: `WI-1 + WI-5`
2. Batch 2: `WI-2`
3. Batch 3: `WI-3`
4. Batch 4: `WI-4`
5. Batch 5: `WI-6`
6. Batch 6: `WI-7`
7. Batch 7: `WI-8`
8. Batch 8: `preview-repair`

## Batch 1 — WI-1 + WI-5

Goal: split the exact-case primitive parity fix from the screenshot work and pair it with the minimal Alert baseline.

Include:
- `frontend/src/components/ui/alert.tsx`
- `frontend/src/services/LiveGenerationUiPrimitives.ts`
- `frontend/src/services/__tests__/LiveGenerationContractValidator.test.ts`
- `frontend/src/services/__tests__/ProtoPipeline.test.ts`
- only the exact-case materialization hunk from `backend/preview-manager.ts`
- only the exact-case test hunk from `backend/preview-manager.test.ts`

Exclude:
- screenshot hunk from `backend/preview-manager.ts`
- screenshot test hunk from `backend/preview-manager.test.ts`
- all `preview-workspace/*` changes
- `preview-workspace/tsconfig.json`

Required tests:
- frontend UI primitive catalog tests
- backend preview-manager exact-case regression test

Required gate telemetry:
- proof that canonical lowercase primitive materialization wins over PascalCase legacy residue
- Alert import-catalog snapshot

Commit recommendation:
- potentially acceptable after hunk split
- reject the current whole-file diff as-is

## Batch 2 — WI-2

Goal: isolate Product Document Set generation and prove persistence beyond generated docs files.

Include:
- `frontend/src/services/ProductDocumentSet.ts`
- `frontend/src/services/GenerationEngine.ts`
- only ProductDocumentSet and prebuilt-plan hunks from `frontend/src/services/ProtoPipeline.ts`
- `frontend/src/services/__tests__/ProductDocumentSet.test.ts`

Exclude:
- `frontend/src/services/ProjectStorage.ts`
- completeness hunks from `ProtoPipeline.ts`
- Pass 2 hunks from `ProtoPipeline.ts`
- uploaded-asset/design-fusion hunks from `ProtoPipeline.ts`

Required tests:
- `ProductDocumentSet.test.ts`
- new integration test proving ProductDocumentSet is stored in project snapshot or run report

Required gate telemetry:
- explicit ProductDocumentSet persistence artifact
- evidence that PDS is not only emitted as generated `docs/architect/*` files

Commit recommendation:
- reject as-is
- current diff is incomplete for the requested WI-2 acceptance definition

## Batch 3 — WI-3

Goal: isolate the completeness gate and prove it blocks false positives.

Include:
- `frontend/src/services/CompletenessGate.ts`
- only completeness-related hunks from `frontend/src/services/ProtoPipeline.ts`
- `frontend/src/services/__tests__/CompletenessGate.test.ts`

Exclude:
- ProductDocumentSet hunks from `ProtoPipeline.ts`
- Pass 2 hunks from `ProtoPipeline.ts`
- uploaded-asset/design-fusion hunks from `ProtoPipeline.ts`

Required tests:
- current completeness helper tests
- new negative test for an empty-but-present required page file
- new integration test proving must-capability misses block acceptance

Required gate telemetry:
- page coverage counts
- missing capability reasons
- explicit block verdict when required capability signals are absent

Commit recommendation:
- partially salvageable
- reject as-is until the empty-file false-positive gap is fixed or disproven

## Batch 4 — WI-4

Goal: isolate Pass 2 critic -> implementer behavior and prove patch-scope safety.

Include:
- only Pass 2 critic/implementer hunks from `frontend/src/services/ProtoPipeline.ts`

Exclude:
- ProductDocumentSet hunks
- completeness hunks
- uploaded-asset/design-fusion hunks

Required tests:
- new dedicated critic-schema tests
- new allowed-patch-scope tests

Required gate telemetry:
- critic verdict artifact
- implementer touched-file list
- evidence that only allowed target files are patched

Commit recommendation:
- reject as-is
- current critic schema is not the strict `Gap[]` contract that was requested

## Batch 5 — WI-6

Goal: isolate `blank_canvas` fast-path routing and persistence.

Include:
- `frontend/src/services/LVPipeline.ts`
- blank_canvas routing hunks from `frontend/src/hooks/useStudio.ts`
- `frontend/src/services/ProjectStorage.ts`
- `frontend/src/services/__tests__/LVPipeline.test.ts`
- existing route-selection support tests such as `frontend/src/hooks/__tests__/useStudioGenerationPath.test.ts`

Exclude:
- unrelated `ProtoPipeline.ts` hunks

Required tests:
- `LVPipeline.test.ts`
- `useStudioGenerationPath` coverage
- new integration proving route selection in `useStudio.ts`

Required gate telemetry:
- explicit `blank_canvas -> LVPipeline`
- explicit `skeleton_assembly -> ProtoPipeline`
- proof that `generationMode` does not steer pipeline choice

Commit recommendation:
- salvageable after dedicated route-selection gate

## Batch 6 — WI-7

Goal: isolate uploaded-assets + design fusion behavior from the rest of `ProtoPipeline.ts`.

Include:
- only uploaded-asset/design-fusion hunks from `frontend/src/services/ProtoPipeline.ts`

Exclude:
- ProductDocumentSet hunks
- completeness hunks
- Pass 2 hunks

Required tests:
- new dedicated uploaded-asset materialization tests
- prompt-plumbing tests for architect/coder prompt evidence

Required gate telemetry:
- uploaded-asset manifest
- attachment prompt evidence
- explicit vision-unavailable fields if the feature depends on vision fallback

Commit recommendation:
- reject as-is until dedicated coverage exists

## Batch 7 — WI-8

Goal: isolate backend screenshot health from case-sensitivity parity.

Include:
- only screenshot hunk from `backend/preview-manager.ts`
- only screenshot-related hunk from `backend/preview-manager.test.ts`

Exclude:
- WI-1 exact-case hunk from both preview-manager files
- all preview-workspace residue

Required tests:
- backend screenshot-handshake regression test
- new integration or manual gate proving screenshot capture failure does not silently pass visual acceptance

Required gate telemetry:
- screenshot success/failure status
- explicit failure handling in acceptance logic

Commit recommendation:
- partially salvageable
- reject as-is until screenshot failure semantics are tightened

## Batch 8 — Preview Repair

Goal: keep RitualFlow preview residue separate from studio-core acceptance.

Include:
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

Exclude:
- `preview-workspace/tsconfig.json`
- all studio-core files

Required tests:
- dedicated preview-only compile gate for the RitualFlow prototype

Required gate telemetry:
- preview compile success
- explicit prototype-only scope marker

Commit recommendation:
- separate preview-repair commit if the team explicitly wants to keep this prototype work
- otherwise do not commit it with the studio-core batches

## Invariants to carry into later gates

- `generationPath` values must remain exactly `skeleton_assembly` and `blank_canvas`
- `skeleton_assembly` must continue to route through `GenerationEngine -> ProtoPipeline`
- `blank_canvas` must continue to route through `LVPipeline` for the empty-project fast path
- `generationMode` (`AUTO`, `APP`, `SUPER`) must not choose the pipeline
- ProductDocumentSet must be persisted outside of generated docs files before WI-2 can pass
- Completeness must not treat an empty page file as implemented before WI-3 can pass
- Pass 2 critic must meet the requested schema before WI-4 can pass
- direct `@radix-ui/react-*` imports still lack hard enforcement and must not be marked solved
- screenshot capture failure still lacks explicit acceptance blocking and must not be marked solved
- `backend/agent-config.json` has no current diff and should stay out of these batches

## Acceptance note

The next safe action is:

1. extract Batch 1 only
2. generate its dedicated gate snapshot
3. accept or reject Batch 1 on its own evidence

No later batch should be accepted from the current mixed diff without repeating that same isolate -> gate -> decide flow.
