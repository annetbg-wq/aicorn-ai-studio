# Batch 5 — WI-6 Acceptance Check

Date: 2026-06-19  
Verdict: **NEEDS PATCH → PATCH APPLIED → PASS**

---

## Risk 1 — Skeleton Leakage

### Does LVPipeline call skeleton selection?

**NO.** `LVPipeline.run()` never calls `selectSkeleton()`, `SkeletonRegistry`, or any function that loads skeleton metadata. Confirmed by grep: no reference to any skeleton selection function in LVPipeline.ts.

### Does it install skeleton files?

**YES — before patch. NO — after patch.**

Before patch: `lvCompile` passed `skeletonId: 'landing-page'` to `POST /api/preview/:buildId/compile`. `backend/preview-manager.ts` `compileBuild()` when given a `skeletonId`:
- Lines 763–781: wipes ALL of `src/` then copies `skeleton/landing-page/src/*` into `preview-workspace/src/` (Hero, SocialProof, CTA, Testimonials sections, landing-page hooks, config, etc.)
- Line 855–860: force-restores `skeleton/landing-page/src/index.css` AFTER user file writes

After patch: `lvCompile` passes `body: JSON.stringify({ files, sessionId })` — no `skeletonId`. Backend runs in legacy/no-skeleton mode:
- Only `PRESERVED_PREVIEW_DIRS` cleanup (no skeleton install)
- No `index.css` force-restore
- LV-generated `index.css` survives intact

### Does it use protectedFiles/deltaFiles from landing-page?

**NO.** LVPipeline does not reference `skeletonProtectedFiles`, `skeletonDeltaFiles`, or any skeleton file manifest. The `LV_NEUTRAL_SKELETON_ID` constant appears only in PDS input (nominal label) and telemetry — not in any file loading path.

### Does it use landing-page design/product assumptions?

**NO.** `buildLvCoderSystemPrompt()` (lines 301–380) contains no landing-page references. The system prompt says "blank_canvas fast path" and "do not assume any skeleton structure." Confirmed by grep: no "landing-page", "hero", "social-proof", "testimonial" in the coder prompt template.

### Is skeletonId='landing-page' used only as a preview compile API compatibility parameter?

**NO — it was also used as a compile substrate. That is the defect this patch fixes.**

After patch: `LV_NEUTRAL_SKELETON_ID = 'landing-page'` is used only for:
1. `ProductDocumentSetInput.skeletonId` — nominal label, no file loading, deterministic function only
2. `runTelemetry.skeletonId` — display label "Blank Canvas" in UI

It is NOT passed to the compile endpoint.

### Route-manifest contract failure

The landing-page skeleton ships `src/route-manifest.json`. `LiveGenerationContractValidator.resolveRouteManifestExpectation('landing-page')` returns `true`, causing the contract validator to REQUIRE `route-manifest.json` in the candidate graph. LVPipeline never generates this file → compile ALWAYS fails with `LiveGenerationContractError` when `skeletonId` is present.

After patch (no `skeletonId` in compile): `resolveRouteManifestExpectation(undefined)` returns `false` → no route-manifest requirement → contract check passes on valid LV output.

### Risk 1 Verdict: FAIL before patch → PASS after patch

---

## Risk 2 — Existing Project Safety

### Does blank_canvas on an existing project replace all files?

**PARTIAL.** Files LVPipeline generates via `parseLvFileMarkers()` + `NEUTRAL_SCAFFOLD` are upserted (overwrites). Files NOT in LV's output remain in the revision state unchanged. In legacy compile mode (no skeletonId), the backend preserves `PRESERVED_PREVIEW_DIRS` from the previous state. This is intentional — blank_canvas generates a fresh app, not a merge; any stale files from a previous run are dead code (not imported by the new App.tsx).

### Does it merge?

**NO explicit merge.** LVPipeline generates a complete standalone application. Stale files from prior runs may persist in preserved directories but are unreferenced dead code. The generated App.tsx starts fresh.

### Is overwrite behavior explicit in telemetry?

**YES — after patch.** Three new fields added to `runTelemetry`:
- `blankCanvasExistingProjectMode: 'fresh' | 'overwrite'` — `'overwrite'` when `config.files` is non-empty
- `existingFileCount: number` — count of files in `config.files` at run time
- `overwriteExplicit: true` — always true; blank_canvas is only reachable via explicit user choice

### Does UI/user choice clearly control generationPath?

**YES.** `generationPath` state in `useStudio.ts`:
```typescript
const [generationPath, setGenerationPath] = useState<'skeleton_assembly' | 'blank_canvas'>('skeleton_assembly');
```
- Initialized to `'skeleton_assembly'`
- Changed only by explicit user action (`setGenerationPath`)
- Never overwritten by `generationMode`, AI response, or any automatic logic

### Does generationMode still not choose pipeline?

**YES — confirmed.** `handleSend` in `useStudio.ts` calls:
```typescript
const blankCanvasFastPath = LVPipeline.isBlankCanvasFastPathEligible({ generationPath });
(blankCanvasFastPath ? LVPipeline : GenerationEngine).run({...config});
```
`generationMode` (AUTO/APP/SUPER) is not inspected at the routing branch.

### Are old projects backward compatible?

**YES.** `restoreGenerationPath()` in `useStudioGenerationPath.ts`:
```typescript
return project?.generationPath === 'blank_canvas' ? 'blank_canvas' : 'skeleton_assembly';
```
Projects without a `generationPath` field (all legacy projects) safely default to `'skeleton_assembly'` → routed to `GenerationEngine.run()`. Test `useStudioGenerationPath.test.ts` covers this (3/3 passing).

### Risk 2 Verdict: CONDITIONAL PASS — missing telemetry fields added by patch → PASS

---

## Test Results After Patch

| Suite                    | Tests | Result |
|--------------------------|-------|--------|
| LVPipeline               | 32    | PASS   |
| useStudioGenerationPath  | 3     | PASS   |
| ProductDocumentSet       | 6     | PASS   |
| CompletenessGate         | 27    | PASS   |
| Pass2Critic              | 64    | PASS   |
| ProtoPipeline            | 68    | PASS   |
| TypeScript typecheck     | —     | 0 errors |

---

## Patch Applied

**File:** `frontend/src/services/LVPipeline.ts`

**Change 1** — Updated constant comment (lines 70–72):
- Clarifies `LV_NEUTRAL_SKELETON_ID` is used only in PDS + telemetry, NOT in compile call
- Added explicit note that compile intentionally omits `skeletonId`

**Change 2** — `lvCompile()` POST body (line 588):
```diff
- body: JSON.stringify({ files, skeletonId: LV_NEUTRAL_SKELETON_ID, sessionId }),
+ // No skeletonId — legacy/no-skeleton mode prevents skeleton file install and CSS force-restore.
+ body: JSON.stringify({ files, sessionId }),
```

**Change 3** — `runTelemetry` block:
```diff
+ blankCanvasExistingProjectMode: Object.keys(config.files).length > 0 ? 'overwrite' : 'fresh',
+ existingFileCount: Object.keys(config.files).length,
+ overwriteExplicit: true,
```

**File:** `frontend/src/shared/projectModel.ts`

**Change 4** — Extended `GenerationRunTelemetry` interface with 3 optional fields:
```diff
+ blankCanvasExistingProjectMode?: 'fresh' | 'overwrite';
+ existingFileCount?: number;
+ overwriteExplicit?: boolean;
```

---

## Final Verdict

**PASS** (after patch)

Both risks are resolved:
- Skeleton leakage: eliminated by removing `skeletonId` from compile POST body
- Existing project safety: explicit by design (user-controlled `generationPath`), telemetry now present
