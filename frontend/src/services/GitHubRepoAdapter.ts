/**
 * GitHubRepoAdapter.ts — concrete RepoSyncAdapter for GitHub
 *
 * Uses the GitHub Git Data REST API to push an ExportFileTree as a single
 * commit on the target branch.
 *
 * API reference:
 *   https://docs.github.com/en/rest/git
 *
 * Flow:
 *   1. Verify credentials  (GET /user)
 *   2. Ensure repo exists  (create if createIfMissing=true)
 *   3. Resolve branch HEAD → parent commit SHA + tree SHA
 *      (or use the default branch's HEAD as parent when the target branch
 *       does not yet exist; gracefully handles brand-new empty repos)
 *   4. Create blobs for every file in ExportFileTree
 *   5. Create a new tree
 *        strategy='merge'   → base_tree = parent tree  (remote-only files kept)
 *        strategy='replace' → no base_tree             (remote tree replaced)
 *   6. Create a commit
 *   7. Update or create the branch ref
 *
 * Registration (call once at app init):
 *   import { GitHubRepoAdapter } from './GitHubRepoAdapter';
 *   import { GitHubSyncService }  from './GitHubSyncService';
 *   GitHubSyncService.register(new GitHubRepoAdapter());
 */

import type {
  RepoSyncAdapter,
  RepoProvider,
  PushProjectOptions,
  RepoSyncResult,
  RepoSyncProgress,
} from './GitHubSyncService';
import type { ExportFileTree } from './adapters/ExportAdapter';

// ─── Minimal GitHub REST response shapes ─────────────────────────────────────

interface GHUser      { login: string }
interface GHRepo      { default_branch: string }
interface GHRef       { object: { sha: string } }
interface GHCommit    { sha: string; tree: { sha: string } }
interface GHBlob      { sha: string }
interface GHTree      { sha: string }
interface GHNewCommit { sha: string }

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class GitHubRepoAdapter implements RepoSyncAdapter {
  readonly provider: RepoProvider = 'github';
  readonly label = 'GitHub';

  private readonly BASE = 'https://api.github.com';

  async push(
    fileTree: ExportFileTree,
    options: PushProjectOptions,
  ): Promise<RepoSyncResult> {
    const { credentials, target, strategy = 'merge', onProgress } = options;
    const { accessToken } = credentials;
    const branch = target.branch ?? 'main';

    const emit = (p: RepoSyncProgress) => onProgress?.(p);

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };

    /** Typed fetch wrapper — resolves or throws with GitHub's error message */
    const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      const res = await fetch(`${this.BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? `GitHub API ${res.status} ${method} ${path}`);
      }
      return res.json() as Promise<T>;
    };

    /** Probe a ref without throwing on 404 */
    const tryGetRef = async (owner: string, repo: string, ref: string): Promise<GHRef | null> => {
      try { return await api<GHRef>('GET', `/repos/${owner}/${repo}/git/ref/heads/${ref}`); }
      catch { return null; }
    };

    try {
      // ── 1. Verify credentials ─────────────────────────────────────────────
      emit({ status: 'authenticating', message: 'Проверка токена GitHub…', percent: 5 });
      const user = await api<GHUser>('GET', '/user');
      const owner = target.owner || user.login;

      // ── 2. Ensure repo exists ─────────────────────────────────────────────
      emit({ status: 'preparing', message: 'Проверка репозитория…', percent: 15 });
      let defaultBranch = branch;

      try {
        const repo = await api<GHRepo>('GET', `/repos/${owner}/${target.name}`);
        defaultBranch = repo.default_branch;
      } catch {
        if (!target.createIfMissing) {
          throw new Error(
            `Репозиторий "${owner}/${target.name}" не найден. ` +
            'Установите createIfMissing: true чтобы создать его автоматически.',
          );
        }

        emit({ status: 'creating-repo', message: `Создание репозитория "${target.name}"…`, percent: 22 });
        await api<GHRepo>('POST', '/user/repos', {
          name:       target.name,
          private:    (target.visibility ?? 'public') === 'private',
          auto_init:  true,   // creates an initial commit so HEAD exists
        });
        // GitHub defaults new repos to "main"
        defaultBranch = 'main';
      }

      // ── 3. Resolve branch HEAD ────────────────────────────────────────────
      emit({ status: 'preparing', message: 'Получение состояния ветки…', percent: 28 });

      let parentSha: string | null    = null;
      let baseTreeSha: string | null  = null;

      // Try target branch first
      const branchRef = await tryGetRef(owner, target.name, branch);
      if (branchRef) {
        parentSha = branchRef.object.sha;
      } else if (defaultBranch !== branch) {
        // Target branch missing — use default branch as parent (will create new branch)
        const defaultRef = await tryGetRef(owner, target.name, defaultBranch);
        if (defaultRef) parentSha = defaultRef.object.sha;
      }

      if (parentSha) {
        const parentCommit = await api<GHCommit>(
          'GET',
          `/repos/${owner}/${target.name}/git/commits/${parentSha}`,
        );
        baseTreeSha = parentCommit.tree.sha;
      }

      // ── 4. Create blobs ───────────────────────────────────────────────────
      emit({ status: 'uploading', message: 'Загрузка файлов…', percent: 35 });

      const entries = Object.entries(fileTree);

      const treeItems: Array<{
        path: string;
        mode: '100644';
        type: 'blob';
        sha: string;
      }> = [];

      for (let i = 0; i < entries.length; i++) {
        const [path, content] = entries[i];

        const blob = await api<GHBlob>(
          'POST',
          `/repos/${owner}/${target.name}/git/blobs`,
          {
            content:  btoa(unescape(encodeURIComponent(content))),
            encoding: 'base64',
          },
        );

        treeItems.push({ path, mode: '100644', type: 'blob', sha: blob.sha });

        emit({
          status:  'uploading',
          message: `Загрузка файлов (${i + 1} / ${entries.length})…`,
          percent: 35 + Math.round(((i + 1) / entries.length) * 35),
        });
      }

      // ── 5. Create tree ────────────────────────────────────────────────────
      emit({ status: 'uploading', message: 'Создание дерева файлов…', percent: 72 });

      const treePayload: { tree: typeof treeItems; base_tree?: string } = {
        tree: treeItems,
        ...(strategy === 'merge' && baseTreeSha ? { base_tree: baseTreeSha } : {}),
      };

      const newTree = await api<GHTree>(
        'POST',
        `/repos/${owner}/${target.name}/git/trees`,
        treePayload,
      );

      // ── 6. Create commit ──────────────────────────────────────────────────
      emit({ status: 'committing', message: 'Создание коммита…', percent: 82 });

      const newCommit = await api<GHNewCommit>(
        'POST',
        `/repos/${owner}/${target.name}/git/commits`,
        {
          message: target.commitMessage ?? 'chore: sync from AI Studio',
          tree:    newTree.sha,
          parents: parentSha ? [parentSha] : [],
        },
      );

      // ── 7. Update or create branch ref ───────────────────────────────────
      emit({ status: 'committing', message: 'Обновление ветки…', percent: 92 });

      const targetBranchExists = (await tryGetRef(owner, target.name, branch)) !== null;

      if (targetBranchExists) {
        await api('PATCH', `/repos/${owner}/${target.name}/git/refs/heads/${branch}`, {
          sha:   newCommit.sha,
          force: false,
        });
      } else {
        await api('POST', `/repos/${owner}/${target.name}/git/refs`, {
          ref: `refs/heads/${branch}`,
          sha: newCommit.sha,
        });
      }

      emit({ status: 'ready', message: '✓ Успешно запушено на GitHub!', percent: 100 });

      return {
        ok:        true,
        repoUrl:   `https://github.com/${owner}/${target.name}`,
        commitSha: newCommit.sha,
        branch,
        provider:  'github',
        pushedAt:  new Date().toISOString(),
      };

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({ status: 'error', message: `Ошибка: ${message}`, percent: 0 });
      return {
        ok:       false,
        repoUrl:  `https://github.com/${target.owner}/${target.name}`,
        branch,
        provider: 'github',
        pushedAt: new Date().toISOString(),
        error:    message,
      };
    }
  }
}
