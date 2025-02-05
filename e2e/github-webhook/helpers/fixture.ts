import fs from 'node:fs';
import path from 'node:path';

import { User } from '@octokit/webhooks-types';
import simpleGit, { SimpleGit } from 'simple-git';

export const FIXTURES_PATH = path.join('e2e', 'github-webhook', 'fixtures');
export const PREPARED_FIXTURES_PATH = fs.mkdtempSync(
  process.env.TEST_TMPDIR + path.sep + 'fixtures-'
);

export enum Fixture {
  EmptyPrefix = 'empty-prefix',
  FixedReleaser = 'fixed-releaser',
  MultiModule = 'multi-module',
  NoPrefix = 'no-prefix',
  Tarball = 'tarball',
  Unversioned = 'unversioned',
  ZeroVersioned = 'zero-versioned',
  Versioned = 'versioned',
  Zip = 'zip',
}

/**
 * Setup a fixture as a ruleset repository by copying the files to
 * a temp directory, initializing a new git repo, and creating a
 * tag to be used for the release. With some url-to-local-path
 * replacement logic in Repository.url when testing, this local
 * repo on disk is treated as the remote upstream repo that gets
 * cloned.
 */
export async function setupLocalRemoteRulesetRepo(
  fixture: Fixture,
  tag: string,
  commitAuthor: Partial<User>
): Promise<void> {
  const gitRepoPath = path.join(PREPARED_FIXTURES_PATH, fixture);
  let git: SimpleGit;

  if (!fs.existsSync(gitRepoPath)) {
    fs.cpSync(path.join(FIXTURES_PATH, fixture), gitRepoPath, {
      recursive: true,
    });

    git = simpleGit(gitRepoPath);
    await git.init();
    await git.add('./*');
    await git.addConfig('user.name', commitAuthor.login!);
    await git.addConfig('user.email', commitAuthor.email!);
    await git.commit('first commit');
  } else {
    git = simpleGit(gitRepoPath);
  }

  const tags = await git.tags();
  if (!tags.all.includes(tag)) {
    await git.addTag(tag);
  }
}

/**
 * Clone the real bazel-central-registry and place it under the same
 * prepared fixtures directory as the rulesets. This way,
 * the swap-url-for-local-path logic that runs when integration testing
 * (see Repository.url) doesn't need a special case when cloning the
 * BCR. It will also get cleaned up alongside the ruleset repos in
 * deleteLocalRemoteRepos.
 */
export async function setupLocalRemoteBcr(): Promise<void> {
  await simpleGit().clone(
    'https://github.com/bazelbuild/bazel-central-registry',
    path.join(PREPARED_FIXTURES_PATH, 'bazel-central-registry')
  );
}

export async function getLatestBranch(git: SimpleGit): Promise<string> {
  const branches = await git.branch(['--sort=-committerdate']);
  return branches.all[0];
}

export function getBcr(): SimpleGit {
  return simpleGit(path.join(PREPARED_FIXTURES_PATH, 'bazel-central-registry'));
}

/**
 * Clean up all prepared ruleset repo local 'remotes'.
 */
export function deleteLocalRemoteRepos() {
  fs.rmSync(PREPARED_FIXTURES_PATH, { recursive: true, force: true });
}
