# Canonical Generation Rules (2026)

## Runtime
- Vite ESM + esbuild-wasm. TypeScript compiled natively.
- Every file is a proper ESM module.

## Code contract
- `import` and `export` are **required** — never strip them.
- TypeScript types, interfaces, generics are **allowed** — never strip them.
- `export default function App()` is **required** in App.tsx.

## Architecture
- Architecture must follow the requested product shape (single-screen, multi-screen, wizard, dashboard, etc.).
- Do **not** force a canned `Home/About` structure or router boilerplate when the request does not require it.
- For multi-screen flows, use `react-router-dom`; for single-screen flows, router is optional.
- Keep `App.tsx` minimal and composition-focused; place feature UI in dedicated files when that improves clarity.

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
- `preview-app` is a **shell-only runtime** and must stay neutral.
- `preview-app/src/App.tsx` is baseline shell UI only (no demo pages, no baked-in app routing).
- Generated source written into preview is the only UI authority for the mounted app.
- Build readiness is signaled by `preview-mounted` with a matching `buildId`.
