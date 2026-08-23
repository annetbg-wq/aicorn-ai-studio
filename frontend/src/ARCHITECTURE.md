# AIC-RG Studio — Architecture

## Canonical generation path (PRODUCTION)

```
GenerationEngine.run()
  → Architect LLM (plan JSON with thinking)
  → Coder LLM (FILE markers)
  → RevisionManager.createCandidate() + writeCandidateFile() × N
  → RevisionManager.compileCandidate()
      → backend /api/preview/{buildId}/compile
      → iframe loads /preview/{buildId}
      → authoritative postMessage: preview-mounted(buildId)
  → RevisionManager.promote() (candidate → active)
  → ProjectRepository.saveProject() → Supabase user_projects
  → ProjectStorage.saveProject() → localStorage (legacy + offline fallback)
```

## Project loading (PRODUCTION)

```
ProjectRepository.getProject(id)
  → Supabase first (full files from code_snapshot.files + chatHistory)
  → localStorage fallback (ProjectStorage, for offline/legacy)
  → ProjectRepository.loadToPreview()
      → RevisionManager.materializePersistedFiles()
          → same candidate/compile/preview-mounted/promote contract as generation
```

## Project list (PRODUCTION)

```
On mount: useState(() => ProjectStorage.listProjects())  ← sync, instant render
          + useEffect → ProjectRepository.listProjects() ← async Supabase refresh
On save:  setProjects(ProjectStorage.listProjects())     ← local update
On delete: ProjectRepository.deleteProject() + ProjectRepository.listProjects()
```

## What localStorage stores (CACHE ONLY)

| Key | Content |
|-----|---------|
| `aic_projects_meta` | Project metadata list (id, name, theme, updatedAt) — Supabase cache |
| `aic-project-meta` | Legacy ProjectStorage metadata index |
| `aic-proj-{id}` | Legacy ProjectStorage full project (files + chatHistory) |
| `BILLING_{id}` | Token usage per project |
| `CURRENT_PROJECT_ID` | Active project UUID |
| `CLOUD_SYNC_{id}` | Supabase sync version + timestamp |
| Agent configs, API keys, UI preferences | ConfigService-managed settings |

## What Supabase stores (SOURCE OF TRUTH)

| Table | Content |
|-------|---------|
| `user_projects` | `code_snapshot: { files, chatHistory, theme, description, createdAt }` |
| `studio_manifest` | Studio health metrics (api_spent, context_health) |
| `agent_sessions` | AgentLab sessions |
| `benchmark_baselines` | BenchmarkGate baselines |

`code_snapshot` evolution:
- Legacy format: `code_snapshot` was a raw `FileMap` (Record<string, string>)
- Current format: `code_snapshot` is `{ files, chatHistory, theme, description, createdAt }`
- `ProjectRepository.getProject()` handles both formats transparently

## Experimental / Lab paths (NOT production generation)

- `Orchestrator.run()` — NOT used for generation; only `applyOperations()` for edit mode patches
- `AgentLoopService` — AgentLab panel only
- `Figma/PlatinumFigma` — isolated, does not touch preview-workspace or user_projects
- `storageService.saveProject()` — legacy debounced sync, superseded by ProjectRepository

## preview runtime/workdir contract (canonical)

- Single runtime/workdir: `preview-workspace` (ephemeral materialization target only)
- Single materialization gateway: `RevisionManager` lifecycle (`candidate → compile → preview-mounted(buildId) → promote`)
- Single ready authority: `preview-mounted` with matching `buildId` (via `PreviewController.expectingBuildId`)
- Source of truth remains persisted project snapshots (`Supabase user_projects`, local fallback)
- `ProjectStorage` is storage compatibility and offline fallback, not preview mutation authority
- Direct `fetch('/__write_preview')` / `fetch('/__clear_preview')` are transport details encapsulated by runtime services, never normal project lifecycle entry points

## rollback / restoreRevision / last-good readiness contract

**No code path may call `notifyReady` before the target compiled preview has actually mounted.**

| Path | Mechanism |
|------|-----------|
| `rollback()` | notifyCompiling(targetId) → iframe.src = /preview/:id → **waitForReady** → notifyReady (on mount) or notifyFailed (on timeout) |
| `restoreRevision()` fast-path | notifyCompiling(revisionId) → iframe.src = /preview/:id → **waitForReady** → notifyReady (on mount) or notifyFailed + throw (on timeout) |
| `restoreRevision()` slow-path | `materializePersistedFiles()` (full compile + preview-mounted contract, same as generation) |
| `promote()` last-good recovery | notifyCompiling(prevId) → iframe.src = /preview/:prevId → **waitForReady** async (fire-and-forget, does not delay PROMOTE_BLOCKED throw) |

All four paths resolve through a real `preview-mounted` message. Optimistic `notifyReady` without mount confirmation is prohibited.

## startup hard-refresh behavior (INTENTIONAL — Option A: auto-restore)

On mount, if an active project exists in localStorage, it is automatically loaded and
a fresh backend compile is triggered. The preview transitions:
  `idle → compiling → (preview-mounted) → ready`

The user does **not** need to take any action. This is intentional: compiled static builds
are ephemeral (cleared on server restart), so every cold start re-compiles from the
persisted project files via the canonical `materializePersistedFiles` path.

## preview-workspace/src/ is a WORKING DIRECTORY, not storage

Files materialized here by RevisionManager are ephemeral — the backend compiler
reads them, runs `vite build`, and writes the output to `builds/:buildId/`.
The static build is then served at `/preview/:buildId`. Files in
`preview-workspace/src/` are NOT the source of truth and are NOT served live
after the backend-compiler path completes.

## Prohibited patterns

```typescript
// ❌ Hardcoded model
model: 'anthropic/claude-3.5-sonnet'
// ✅ Via ConfigService
model: ConfigService.resolveModel('build')

// ❌ Conditional iframe render
{tab === 'preview' && <SandpackView />}
// ✅ Display control only (never unmount)
<div style={{ display: tab === 'preview' ? 'block' : 'none' }}>
  <SandpackView />
</div>

// ❌ localStorage as source of truth for projects
ProjectStorage.getProject(id)  // as primary source
// ✅ Supabase first, localStorage fallback
ProjectRepository.getProject(id)

// ❌ Write localStorage directly for projects
localStorage.setItem('projects', ...)
// ✅ Only via ProjectRepository or ConfigService
ProjectRepository.saveProject(project)
ConfigService.setApiKey(key)
```
