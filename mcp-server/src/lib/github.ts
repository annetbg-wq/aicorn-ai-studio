import { Octokit } from '@octokit/rest';
import { env, repoSlug } from '../env.js';

let _octokit: Octokit | undefined;

export function github(): Octokit {
  if (!_octokit) _octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  return _octokit;
}

export const repo = { owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO };

/** Authenticated HTTPS remote URL for git operations (push/fetch), token never logged. */
export function authenticatedRemoteUrl(): string {
  return `https://x-access-token:${env.GITHUB_TOKEN}@github.com/${repoSlug()}.git`;
}
