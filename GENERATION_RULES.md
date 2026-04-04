# Canonical Generation Rules (2026)

## Runtime
- Vite ESM + esbuild-wasm. TypeScript compiled natively.
- Every file is a proper ESM module.

## Code contract
- `import` and `export` are **required** — never strip them.
- TypeScript types, interfaces, generics are **allowed** — never strip them.
- `export default function App()` is **required** in App.tsx.

## Architecture
- **Multi-file is the default.** App.tsx is orchestration-only (BrowserRouter + Routes).
- Every component and page lives in its own file under `components/` or `pages/`.
- Multi-page routing uses `react-router-dom` (BrowserRouter, Routes, Route, Link, useNavigate).
- `useState`-based navigation is NOT a substitute for react-router-dom.

## Heuristic checker (Orchestrator.heuristicCheck)
Only flags real JSX errors:
- Void elements not self-closed (`<input>` → `<input />`)
- HTML `class=` attribute (use `className=`)

Intentionally does NOT flag: imports, export default, TypeScript annotations.

## Local fixer (Dispatcher.localFix)
Only performs safe, non-destructive fixes:
- `class=` → `className=`
- Self-close void elements

Intentionally does NOT strip: imports, exports, TypeScript.

## Preview runtime compatibility
- `_bootstrap.tsx` discovers the default export from App.tsx via ESM import.
- `routes.json` is a manifest stored alongside source files; it is NOT used to control bootstrap.
- BrowserRouter in App.tsx handles all SPA routing — the sandbox has a catch-all fallback.
