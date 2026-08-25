import { simpleGit, type SimpleGit } from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';
import { authenticatedRemoteUrl } from './github.js';
import { repoSlug } from '../env.js';

const REPO_DIR = process.env.REPO_CACHE_DIR ?? '/tmp/aicorn-repo';
const DEFAULT_BRANCH = 'main';

let git: SimpleGit | undefined;

// All git-mutating tool calls funnel through this to serialize access to the
// single local working copy — Node is single-threaded but git operations are
// async, so two overlapping tool calls could otherwise interleave and corrupt
// the working tree (e.g. one checkout landing mid-commit of another).
let queue: Promise<unknown> = Promise.resolve();
export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function ensureCloned(): Promise<SimpleGit> {
  if (git) return git;
  if (!fs.existsSync(path.join(REPO_DIR, '.git'))) {
    fs.mkdirSync(REPO_DIR, { recursive: true });
    const bootstrap = simpleGit();
    await bootstrap.clone(authenticatedRemoteUrl(), REPO_DIR);
  }
  git = simpleGit(REPO_DIR);
  return git;
}

/** Fetches and hard-resets the local clone to origin/<branch>. Call before any read. */
export async function syncToLatest(branch = DEFAULT_BRANCH): Promise<SimpleGit> {
  const g = await ensureCloned();
  await g.fetch(['origin']);
  await g.checkout(branch).catch(() => g.checkoutBranch(branch, `origin/${branch}`));
  await g.reset(['--hard', `origin/${branch}`]);
  await g.clean('f', ['-d']);
  return g;
}

export function repoDir(): string {
  return REPO_DIR;
}

export async function readFileAtRef(filePath: string, ref = DEFAULT_BRANCH): Promise<string> {
  const g = await ensureCloned();
  await g.fetch(['origin']);
  return g.show([`origin/${ref}:${filePath}`]);
}

export async function gitStatus(branch = DEFAULT_BRANCH) {
  const g = await syncToLatest(branch);
  return g.status();
}

export async function gitDiff(refA: string, refB: string, filePath?: string): Promise<string> {
  const g = await ensureCloned();
  await g.fetch(['origin']);
  const args = [`origin/${refA}`, `origin/${refB}`];
  if (filePath) args.push('--', filePath);
  return g.diff(args);
}

export async function gitLog(filePath: string | undefined, limit: number, ref = DEFAULT_BRANCH) {
  const g = await ensureCloned();
  await g.fetch(['origin']);
  const options: Record<string, unknown> = { maxCount: limit, [`origin/${ref}`]: null };
  if (filePath) options.file = filePath;
  const res = await g.log(options as never);
  return res.all;
}

export async function grepCode(query: string, ref = DEFAULT_BRANCH): Promise<string[]> {
  const g = await ensureCloned();
  await g.fetch(['origin']);
  try {
    const out = await g.raw(['grep', '-n', '-I', '-i', '--max-count=200', query, `origin/${ref}`]);
    return out.split('\n').filter(Boolean);
  } catch (err) {
    // git grep exits 1 with no output when there are zero matches — not an error.
    if (err instanceof Error && /exit code 1/.test(err.message)) return [];
    throw err;
  }
}

export async function createBranch(name: string, fromRef = DEFAULT_BRANCH): Promise<void> {
  const g = await syncToLatest(fromRef);
  await g.checkoutBranch(name, `origin/${fromRef}`).catch(async () => {
    // branch already exists locally or remotely — just check it out and rebase onto fromRef.
    await g.fetch(['origin', `${name}:${name}`]).catch(() => {});
    await g.checkout(name);
  });
}

export async function writeFiles(files: Array<{ path: string; content: string }>): Promise<void> {
  const g = await ensureCloned();
  for (const f of files) {
    const abs = path.resolve(REPO_DIR, f.path);
    if (!abs.startsWith(path.resolve(REPO_DIR))) {
      throw new Error(`Refusing to write outside the repo: ${f.path}`);
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.content, 'utf-8');
  }
  void g; // ensureCloned() guarantees the clone exists; writes are plain fs.
}

export async function commitAndPush(branch: string, message: string): Promise<{ pushed: boolean; sha: string | null }> {
  const g = await ensureCloned();
  await g.checkout(branch);
  await g.add(['-A']);
  const diff = await g.diff(['--cached', '--name-only']);
  if (!diff.trim()) return { pushed: false, sha: null };
  await g.commit(message);
  await g.push(['origin', branch, '--set-upstream']);
  const sha = (await g.revparse(['HEAD'])).trim();
  return { pushed: true, sha };
}

export function remoteRepoSlug(): string {
  return repoSlug();
}
