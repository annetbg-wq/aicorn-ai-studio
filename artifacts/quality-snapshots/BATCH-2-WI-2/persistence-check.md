# Persistence Check

## Real Save Path
- ProjectStorage: yes. `useStudio` saves `finalFiles` into `ProjectStorage.saveProject(...)`, and `ProjectStorage` materializes `StoredProject.productDocs` from `docs/architect/product-document-set.json` or `src/docs/architect/product-document-set.json`.
- ProjectRepository: yes, as part of `code_snapshot.files` in the persisted project snapshot. There is no dedicated top-level `productDocs` field in `ProjectRepository` yet.
- Project snapshot: yes. The structured JSON file and markdown bundle live in the saved project file map.
- Run report: no dedicated PDS payload in `GenerationReport`; only run-level telemetry summary is attached to the generation result.
- Gate artifacts only: no.

## Exact Write / Restore Points
- PDS build and ID linkage: `frontend/src/services/ProductDocumentSet.ts:1210`, `frontend/src/services/ProductDocumentSet.ts:1219`, `frontend/src/services/ProductDocumentSet.ts:1247`, `frontend/src/services/ProductDocumentSet.ts:1317`.
- PDS injected into pipeline output: `frontend/src/services/ProtoPipeline.ts:2254`, `frontend/src/services/ProtoPipeline.ts:2563`, `frontend/src/services/ProtoPipeline.ts:2928`.
- Run result contains PDS summary: `frontend/src/services/ProtoPipeline.ts:2928`, `frontend/src/services/GenerationEngine.ts:448`.
- Normal run saves project snapshot locally: `frontend/src/hooks/useStudio.ts:2482`, `frontend/src/services/ProjectStorage.ts:315`, `frontend/src/services/ProjectStorage.ts:323`, `frontend/src/services/ProjectStorage.ts:330`.
- Normal run saves project snapshot remotely / repository-side: `frontend/src/hooks/useStudio.ts:2574`, `frontend/src/services/ProjectRepository.ts:443`, `frontend/src/services/ProjectRepository.ts:492`.
- PDS restored on local project reload: `frontend/src/services/ProjectStorage.ts:267`, `frontend/src/services/ProjectStorage.ts:286`.
- PDS also survives repository reload via snapshot files: `frontend/src/services/ProjectRepository.ts:358`, `frontend/src/services/ProjectRepository.ts:364`.

## Yes / No
- product_docs_saved survives page reload / project reload: yes
- product_docs_saved exists outside generated app files: yes
- product_docs_saved exists outside gate artifacts: yes
- old projects without productDocs load safely: yes
- PDS id is available in run result/report: yes
- PDS markdown bundle is available after run: yes

## Verdict Basis
- Exact persistence target for Batch 2: `project_storage`
- Secondary persistence path also exists through project snapshot files / `ProjectRepository.code_snapshot.files`.
- `run_telemetry` was not the real persistent target and has been corrected.
