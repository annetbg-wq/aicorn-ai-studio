# UI Snapshot — LIVE-PRODUCT-PATH

**Date:** 2026-06-20  
**Branch:** p2/generation-path-persistence-shelved

---

## 1. LV Progress Labels (blank_canvas)

### Before (FAIL)
```
○ Дизайн-пак
○ Архитектура
○ Выбор skeleton
⚡ Кодирование
○ Финальная сборка
○ Превью
```

### After (PASS)
```
✓ Product docs
⚡ LV coder
○ Completeness
○ Build
○ Preview
```

**Removed:** skeleton, Выбор skeleton, Архитектура, шаблон  
**Added:** Product docs, LV coder, Completeness, Build, Preview

---

## 2. Product Docs Panel (Reasoning Tab)

### After blank_canvas run — PASS
```
PRODUCT DOCS
PDS id: <uuid>  Features: <N>

[Vision] [Feature checklist] [Screens] [Flows]
[Data model] [Design brief] [Implementation brief] [Acceptance]
```
- Each button calls setActiveFile(path) + setTab('code') → opens doc in Code tab
- data-testid="product-docs-panel" present

### Before any run — PASS
```
PRODUCT DOCS
Product Docs missing — run a generation to build them.
```
- data-testid="product-docs-missing" present

---

## 3. Acceptance Matrix

| Criterion | Status |
|-----------|--------|
| blank_canvas run → onFiles contains docs/architect/product-document-set.json | ✅ PASS (test #11a) |
| blank_canvas run → onFiles contains all 8 required markdown docs | ✅ PASS (test #11b) |
| runTelemetry.productDocs.id matches product-document-set.json id | ✅ PASS (test #11c) |
| ProjectStorage restores productDocs from LV-generated files | ✅ PASS (test #12a) |
| productDocs.generationPath === 'blank_canvas' | ✅ PASS (test #12b) |
| blank_canvas STEP_RU has no skeleton/architecture labels | ✅ PASS (test #13a) |
| blank_canvas STEP_ORDER has product-docs, no skeleton/architect/pack | ✅ PASS (test #13b) |
| Product Docs panel shows PDS id and feature count when docs present | ✅ PASS (code review) |
| Product Docs panel shows "missing" when no docs | ✅ PASS (code review) |
| Product Docs panel doc buttons navigate to Code tab | ✅ PASS (code review) |

---

## 4. Files Changed

| File | Change |
|------|--------|
| `services/ProtoPipeline.ts` | Added `'product-docs'` to StepId union + STEP_LABEL |
| `services/LVPipeline.ts` | materializeProductDocumentSet instead of buildProductDocumentSet; emit product-docs step; add PDS file ops; fix telemetry |
| `hooks/useStudio.ts` | blank_canvas-specific STEP_ORDER and STEP_RU (no skeleton/architect) |
| `components/PreviewCanvas.tsx` | ProductDocsPanel component + Reasoning tab injection |
| `services/__tests__/LVPipeline.test.ts` | 9 new tests (suites #11, #12, #13) — all 39 pass |
