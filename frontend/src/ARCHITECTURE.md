# AIC-RG Studio — Architecture

## Canonical generation path (PRODUCTION)

```
SimpleGeneration.run()
  → Architect LLM (plan JSON with thinking)
  → Coder LLM (FILE markers)
  → writePreviewFile() × N → preview-app/src/
  → Vite HMR (port 3100) picks up changes
  → force-preview-reload → SandpackPreview reloads iframe
  → ProjectRepository.saveProject() → Supabase user_projects
  → ProjectStorage.saveProject() → localStorage (legacy + offline fallback)
```

## Project loading (PRODUCTION)

```
ProjectRepository.getProject(id)
  → Supabase first (full files from code_snapshot.files + chatHistory)
  → localStorage fallback (ProjectStorage, for offline/legacy)
  → ProjectRepository.loadToPreview()
      → ProjectStorage.loadToPreview() (battle-tested theme CSS handling)
      → force-preview-reload
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
- `Figma/PlatinumFigma` — isolated, does not touch preview-app or user_projects
- `storageService.saveProject()` — legacy debounced sync, superseded by ProjectRepository

## preview-app/src/ is a WORKING DIRECTORY, not storage

Files written here by SimpleGeneration or ProjectRepository.loadToPreview() are
ephemeral — Vite HMR serves them live. They are NOT the source of truth.
After restart, preview-app/src/ is restored only when a project is explicitly loaded.

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
