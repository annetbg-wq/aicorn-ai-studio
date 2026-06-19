# Batch 1 Excluded Hunks

## Included partial hunks

### `backend/preview-manager.ts`

- Included function: `hasUiPrimitiveFile`
- Included current lines: `587-612`
- Included reason: WI-1 exact-case primitive materialization. The new implementation only accepts exact lowercase file names (`button.tsx`, `button/index.tsx`) and no longer treats `Button.tsx` as equivalent to `button.tsx`.

### `backend/preview-manager.test.ts`

- Included test: `materializes canonical lowercase primitives even when a legacy PascalCase file already exists`
- Included current lines: `185-205`
- Included reason: WI-1 regression proof that canonical lowercase materialization wins over legacy PascalCase residue.

## Excluded mixed hunks

### `backend/preview-manager.ts`

- Excluded block: `captureScreenshot()` and `window.addEventListener('message', ...)`
- Excluded current lines: `953-985`
- Excluded WI: `WI-8`
- Excluded reason: screenshot handshake logic belongs to visual/screenshot health, not to exact-case primitive parity.

### `backend/preview-manager.test.ts`

- Excluded test: `canonical preview main.tsx contains the screenshot capture handshake`
- Excluded current lines: `233-238`
- Excluded WI: `WI-8`
- Excluded reason: validates screenshot transport strings (`capture-screenshot`, `screenshot-result`, `html2canvas`) and must not be pulled into Batch 1.

## Whole-file exclusions

- `frontend/src/services/ProtoPipeline.ts`
- `frontend/src/services/ProductDocumentSet.ts`
- `frontend/src/services/CompletenessGate.ts`
- `frontend/src/services/LVPipeline.ts`
- `frontend/src/services/GenerationEngine.ts`
- `frontend/src/hooks/useStudio.ts`
- `frontend/src/services/ProjectStorage.ts`
- `frontend/src/services/DocumentationPackService.ts`
- `preview-workspace/tsconfig.json`
- all `preview-workspace/*` residue
- all non-Batch-1 product-code artifacts

## Case-sensitivity note

`preview-workspace/tsconfig.json` was explicitly excluded because setting `forceConsistentCasingInFileNames` to `false` weakens the exact-case invariant that Batch 1 is supposed to prove.
