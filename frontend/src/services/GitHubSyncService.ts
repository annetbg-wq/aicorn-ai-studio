/**
 * GitHubSyncService.ts — Typed seam for exporting generated projects to GitHub
 *
 * Scope: source-control push only.
 * Independent from:
 *   - DeployService    (Vercel/Netlify hosting — a post-build concern)
 *   - PreviewCanvas    (Vite sandbox — runtime preview concern)
 *   - storageService   (Supabase cloud save — studio persistence concern)
 *
 * The service operates on ExportFileTree (path → content) produced by
 * ExportAdapter.toFileTree(), which is already the canonical "developer project"
 * representation.  No sandbox or preview artefacts are included.
 *
 * Typical flow:
 *   1. ExportAdapter.toFileTree(graph)  → ExportFileTree
 *   2. GitHubSyncService.pushProject(fileTree, options)  → RepoSyncResult
 *
 * To add a new repository host (GitLab, Gitea, …):
 *   1. Add its id to RepoProvider below
 *   2. Create a class implementing RepoSyncAdapter in services/repoAdapters/
 *   3. Register it in GitHubSyncService.REGISTRY
 */

import type { ExportFileTree } from './adapters/ExportAdapter';

// ─── Provider identifiers ─────────────────────────────────────────────────────

/**
 * Canonical source-control hosting providers.
 * Intentionally separate from BackendProvider (infra) and DeployProvider (hosting).
 */
export type RepoProvider = 'github' | 'gitlab' | 'gitea' | 'custom';

// ─── Auth / credential config ─────────────────────────────────────────────────

/**
 * Credentials needed to authenticate against a repository provider.
 * Store via ConfigService; never hardcode or log.
 */
export interface RepoCredentials {
  /** Provider this credential set is valid for */
  provider: RepoProvider;
  /**
   * Personal Access Token (GitHub: classic PAT or fine-grained with repo scope).
   * Required for all write operations.
   */
  accessToken: string;
  /** GitHub/GitLab username or org name — used in API path construction */
  ownerLogin: string;
}

// ─── Target repository descriptor ────────────────────────────────────────────

/**
 * Describes the repository to push into.
 * Does NOT contain credentials — pass those separately via RepoCredentials.
 */
export interface RepoTarget {
  /** Repository name (slug), e.g. "my-app" */
  name: string;
  /** Full owner login — user or org, e.g. "alice" or "acme-corp" */
  owner: string;
  /** Target branch (defaults to "main" if omitted) */
  branch?: string;
  /** Whether to create the repository if it does not already exist */
  createIfMissing?: boolean;
  /** Repository visibility when creating (ignored if repo already exists) */
  visibility?: 'public' | 'private';
  /** Commit message for the push (defaults to "chore: sync from AI Studio") */
  commitMessage?: string;
}

// ─── Push / sync options ──────────────────────────────────────────────────────

/**
 * Full options for a single push operation.
 * Combines credentials + target + behaviour flags.
 */
export interface PushProjectOptions {
  credentials: RepoCredentials;
  target: RepoTarget;
  /**
   * Strategy for files already in the remote tree that are not in the local
   * ExportFileTree.
   * - 'merge'    (default) — only create/update files in the export set; remote-only files are left untouched
   * - 'replace'            — delete remote-only files; the remote tree exactly mirrors the export set
   */
  strategy?: 'merge' | 'replace';
  /** Optional callback for incremental progress reporting */
  onProgress?: (progress: RepoSyncProgress) => void;
}

/**
 * Alias for future multi-revision / watch-mode sync.
 * Same shape as PushProjectOptions — kept as a named alias to give
 * callers a semantic distinction.
 */
export type SyncProjectOptions = PushProjectOptions;

// ─── Progress ─────────────────────────────────────────────────────────────────

export type RepoSyncStatus =
  | 'idle'
  | 'authenticating'
  | 'preparing'       // building tree SHA list
  | 'creating-repo'   // only when createIfMissing=true and repo is absent
  | 'uploading'       // blob creation / tree construction
  | 'committing'
  | 'ready'
  | 'error';

export interface RepoSyncProgress {
  status: RepoSyncStatus;
  message: string;
  /** 0–100 */
  percent: number;
}

// ─── Result ───────────────────────────────────────────────────────────────────

export interface RepoSyncResult {
  ok: boolean;
  /** HTTPS URL of the pushed repository, e.g. "https://github.com/alice/my-app" */
  repoUrl: string;
  /** SHA of the new commit (undefined if ok=false) */
  commitSha?: string;
  /** Target branch that was updated */
  branch: string;
  provider: RepoProvider;
  /** ISO timestamp of the push */
  pushedAt: string;
  /** Human-readable error when ok=false */
  error?: string;
}

// ─── Adapter interface ────────────────────────────────────────────────────────

/**
 * RepoSyncAdapter — implement one per RepoProvider.
 *
 * Each adapter encapsulates:
 *   - Provider API calls (REST or GraphQL)
 *   - Auth header construction
 *   - Error normalisation → RepoSyncResult
 *
 * Adapters receive an ExportFileTree (path → UTF-8 content) and produce
 * a RepoSyncResult.  They MUST NOT touch preview, deploy, or studio state.
 *
 * @example
 *   export class GitHubRepoAdapter implements RepoSyncAdapter {
 *     readonly provider: RepoProvider = 'github';
 *     readonly label = 'GitHub';
 *     async push(fileTree, options) { ... }
 *   }
 */
export interface RepoSyncAdapter {
  readonly provider: RepoProvider;
  readonly label: string;
  /**
   * Push fileTree to the remote repository described in options.
   * Must resolve — never reject — callers inspect result.ok.
   */
  push(fileTree: ExportFileTree, options: PushProjectOptions): Promise<RepoSyncResult>;
}

// ─── Service facade ───────────────────────────────────────────────────────────

/**
 * GitHubSyncService — static facade over registered RepoSyncAdapters.
 *
 * Usage:
 *   const result = await GitHubSyncService.pushProject(fileTree, {
 *     credentials: { provider: 'github', accessToken, ownerLogin },
 *     target: { name: 'my-app', owner: ownerLogin, branch: 'main', createIfMissing: true },
 *   });
 *
 * Note: register a concrete RepoSyncAdapter before calling pushProject().
 *   GitHubSyncService.register(new GitHubRepoAdapter());
 */
export const GitHubSyncService = {
  /** @internal adapter registry — keyed by RepoProvider */
  _registry: new Map<RepoProvider, RepoSyncAdapter>(),

  /**
   * Register a concrete adapter.  Call once at app initialisation.
   * Safe to call multiple times — later registrations overwrite earlier ones.
   */
  register(adapter: RepoSyncAdapter): void {
    GitHubSyncService._registry.set(adapter.provider, adapter);
  },

  /**
   * Push an ExportFileTree to a remote repository.
   *
   * Returns a resolved RepoSyncResult (ok=false on any failure).
   * Calls options.onProgress at each status transition.
   *
   * @param fileTree  Output of ExportAdapter.toFileTree().fileTree
   * @param options   Credentials + target + behaviour flags
   */
  async pushProject(
    fileTree: ExportFileTree,
    options: PushProjectOptions,
  ): Promise<RepoSyncResult> {
    const { credentials } = options;
    const adapter = GitHubSyncService._registry.get(credentials.provider);

    if (!adapter) {
      return {
        ok: false,
        repoUrl: '',
        branch: options.target.branch ?? 'main',
        provider: credentials.provider,
        pushedAt: new Date().toISOString(),
        error: `No adapter registered for provider "${credentials.provider}". Call GitHubSyncService.register() first.`,
      };
    }

    return adapter.push(fileTree, options);
  },

  /**
   * syncProject — semantic alias for pushProject.
   * Use this name when the intent is continuous/watch-mode sync rather than a
   * one-shot export push.  Same implementation, distinguished by call-site intent.
   */
  async syncProject(
    fileTree: ExportFileTree,
    options: SyncProjectOptions,
  ): Promise<RepoSyncResult> {
    return GitHubSyncService.pushProject(fileTree, options);
  },

  /** Returns all registered providers with their labels */
  listProviders(): Array<{ provider: RepoProvider; label: string }> {
    return Array.from(GitHubSyncService._registry.values()).map(a => ({
      provider: a.provider,
      label:    a.label,
    }));
  },
} as const;
