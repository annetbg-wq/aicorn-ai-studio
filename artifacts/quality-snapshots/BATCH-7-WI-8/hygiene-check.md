# Batch 7 WI-8 — Hygiene Check
Date: 2026-06-19

## 1. Root npm install impact

`npm install` was run at repo root because `node_modules/` was empty despite
`package.json` listing `vitest`, `express`, etc.

| File | Changed? | Notes |
|---|---|---|
| `package.json` | **NO** | unchanged |
| `package-lock.json` | **NO** | already in sync with lock; install just materialized node_modules |
| `frontend/package.json` | **NO** | untouched |
| `frontend/package-lock.json` | **NO** | untouched |
| `node_modules/` tracked by git | **NO** | not tracked |

**Verdict**: no lock noise introduced. Safe.

## 2. vitest.config.ts

**Required**: `npx vitest run backend/preview-manager.test.ts` must work from repo root.

Root `vitest.config.ts` has `root: './frontend'`, so backend/ is outside the search
path without an explicit include. The minimal fix is to add one entry to `test.include`.

**Original change (too broad):**
```diff
+  include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)', '../backend/**/*.test.ts'],
+  allow: ['..', '../prototype-bank', '../backend'],
```

**After hygiene cleanup (targeted):**
```diff
+  include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)', '../backend/preview-manager.test.ts'],
```
- `server.fs.allow` reverted — `fsPromises.readFile` is Node.js I/O, not Vite file-serving
- `include` narrowed to exactly one file (`../backend/preview-manager.test.ts`), not a wildcard
- Does not pick up `backend/auth-token.test.ts` or future backend tests inadvertently

**Scope expansion risk**: minimal — only the specific gate-required test file is added.

## 3. Empty canvas test quality

**Original (fragile):**
```javascript
const emptyCanvasBlock = src.slice(
  src.indexOf('canvas.width === 0 || canvas.height === 0'),
  src.indexOf('canvas.toDataURL'),  // ← depended on first occurrence = a comment
);
expect(emptyCanvasBlock).not.toContain('dataUrl:');
```

The test passed only because a comment `// canvas.toDataURL...` was inserted into
production code to make `indexOf('canvas.toDataURL')` land inside the error branch
rather than at `dataUrl: canvas.toDataURL` in the success branch.

**Root cause**: `canvas.toDataURL` appears in `dataUrl: canvas.toDataURL(...)` immediately
preceded by `dataUrl: `. The slice `[guardStart, indexOf('canvas.toDataURL')]` always
includes `dataUrl: ` before the terminus. The comment was a workaround, not a fix.

**Fix (position-ordering assertions):**
```javascript
const emptyGuardIdx    = src.indexOf('canvas.width === 0 || canvas.height === 0');
const emptyErrorIdx    = src.indexOf("error: 'empty_canvas:");
const earlyReturnIdx   = src.indexOf('return;', emptyGuardIdx);
const successDataUrlIdx = src.indexOf('dataUrl: canvas.toDataURL');

expect(emptyErrorIdx).toBeGreaterThan(emptyGuardIdx);   // error inside guard block
expect(earlyReturnIdx).toBeGreaterThan(emptyErrorIdx);  // return follows error
expect(successDataUrlIdx).toBeGreaterThan(earlyReturnIdx); // success only after return
```

This verifies the structural invariant (guard → error → early return → success path)
without depending on any comment, any first-occurrence, or any specific string distance.

**Production code comment removed**: the `// canvas.toDataURL produces empty image...`
comment was deleted from `backend/preview-manager.ts` (it existed solely to game the test).

## 4. Gate re-run results (post-hygiene)

| Command | Result | Tests |
|---|---|---|
| `npm run typecheck --prefix frontend` | ✅ PASS | 0 errors |
| `npm test --prefix frontend -- Pass2` | ✅ PASS | 64 |
| `npm test --prefix frontend -- ProtoPipeline` | ✅ PASS | 68 |
| `npm test --prefix frontend -- LVPipeline` | ✅ PASS | 32 |
| `npm test --prefix frontend -- CompletenessGate` | ✅ PASS | 27 |
| `npm test --prefix frontend -- ProductDocumentSet` | ✅ PASS | 6 |
| `npm test --prefix frontend -- DesignFusion` | ✅ PASS | 63 |
| `npx vitest run backend/preview-manager.test.ts` | ✅ PASS | 63 |

## Final verdict

**PASS** — all hygiene concerns resolved, all gate commands green, no commit.
