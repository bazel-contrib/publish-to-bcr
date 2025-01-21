import { randomUUID } from 'node:crypto';

import { backOff, BackoffOptions } from 'exponential-backoff';
import { Mocked, mocked } from 'jest-mock';
import path from 'path';

import { GitClient } from '../infrastructure/git';
import {
  GitHubApp,
  GitHubClient,
  User as GitHubUser,
} from '../infrastructure/github';
import { PublishEntryService } from './publish-entry';
import { Repository } from './repository';
import { RulesetRepository } from './ruleset-repository';
import { User, UserService } from './user';

// Fake the BCR Repository with a diskPath so that it
// doesn't complain about not being checked out.
const CANONICAL_BCR = {
  owner: 'bazelbuild',
  name: 'bazel-central-registry',
  diskPath: path.join(process.env.TEST_TMPDIR, 'bazel-central-registry'),
} as Repository;

jest.mock('exponential-backoff');
jest.mock('../infrastructure/git');
jest.mock('../infrastructure/github');
jest.mock('./ruleset-repository', () => {
  return {
    RulesetRepository: {
      getVersionFromTag: jest.requireActual('./ruleset-repository')
        .RulesetRepository.getVersionFromTag,
      create(
        name: string,
        owner: string,
        _verifyAtRef?: string
      ): Promise<RulesetRepository> {
        // Skip all of the bcr template file validation that would
        // normally occur in a RulesetRepository since it's not
        // needed for this test suite.
        return Promise.resolve({
          owner,
          name,
          canonicalName: `${owner}/${name}`,
        } as unknown as RulesetRepository);
      },
    },
  };
});

let publishEntryService: PublishEntryService;
let mockGitClient: Mocked<GitClient>;
let mockBcrForkGitHubClient: Mocked<GitHubClient>;
let mockBcrGitHubClient: Mocked<GitHubClient>;

const realExponentialBackoff = jest.requireActual('exponential-backoff');

beforeEach(() => {
  mockGitClient = mocked(new GitClient());
  mocked(GitHubClient).mockClear();
  mockBcrForkGitHubClient = mocked(new GitHubClient({} as any));
  mockBcrGitHubClient = mocked(new GitHubClient({} as any));
  publishEntryService = new PublishEntryService(
    mockGitClient,
    mockBcrGitHubClient
  );
});

describe('publish', () => {
  test("creates a pull request from the bcr fork's provided branch to 'main' on the bcr", async () => {
    const bcrFork = new Repository('bazel-central-registry', 'bar');
    const bcr = new Repository('bazel-central-registry', 'bazelbuild');
    const branch = 'branch_with_entry';
    const tag = 'v1.0.0';

    await publishEntryService.publish(
      tag,
      bcrFork,
      bcr,
      branch,
      ['rules_foo'],
      `github.com/aspect-build/rules_foo/releases/tag/${tag}`
    );

    expect(mockBcrGitHubClient.createPullRequest).toHaveBeenCalledWith(
      bcrFork.owner,
      branch,
      bcr.owner,
      bcr.name,
      'main',
      expect.any(String),
      expect.any(String)
    );
  });

  test('includes the module name and release version in the PR title', async () => {
    const bcrFork = new Repository('bazel-central-registry', 'bar');
    const bcr = new Repository('bazel-central-registry', 'bazelbuild');
    const branch = 'branch_with_entry';
    const tag = 'v1.0.0';
    const version = '1.0.0';

    await publishEntryService.publish(
      version,
      bcrFork,
      bcr,
      branch,
      ['rules_foo'],
      `github.com/aspect-build/rules_foo/releases/tag/${tag}`
    );

    expect(mockBcrGitHubClient.createPullRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.stringContaining('rules_foo'),
      expect.any(String)
    );
    expect(mockBcrGitHubClient.createPullRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.stringContaining('1.0.0'),
      expect.any(String)
    );
  });

  test('includes multiple module names in the PR title', async () => {
    const bcrFork = new Repository('bazel-central-registry', 'bar');
    const bcr = new Repository('bazel-central-registry', 'bazelbuild');
    const branch = 'branch_with_entry';
    const tag = 'v1.0.0';

    await publishEntryService.publish(
      tag,
      bcrFork,
      bcr,
      branch,
      ['rules_foo', 'rules_bar'],
      `github.com/aspect-build/rules_foo/releases/tag/${tag}`
    );

    expect(mockBcrGitHubClient.createPullRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.stringContaining('rules_foo'),
      expect.any(String)
    );
    expect(mockBcrGitHubClient.createPullRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.stringContaining('rules_bar'),
      expect.any(String)
    );
    expect(mockBcrGitHubClient.createPullRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.stringContaining('1.0.0'),
      expect.any(String)
    );
  });

  test('includes the release url in the body', async () => {
    const bcrFork = new Repository('bazel-central-registry', 'bar');
    const bcr = new Repository('bazel-central-registry', 'bazelbuild');
    const branch = 'branch_with_entry';
    const tag = 'v1.0.0';

    await publishEntryService.publish(
      tag,
      bcrFork,
      bcr,
      branch,
      ['rules_foo'],
      `github.com/aspect-build/rules_foo/releases/tag/${tag}`
    );

    expect(mockBcrGitHubClient.createPullRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.stringContaining(
        `github.com/aspect-build/rules_foo/releases/tag/${tag}`
      )
    );
  });

  test('returns the created pull request number', async () => {
    const bcrFork = new Repository('bazel-central-registry', 'bar');
    const bcr = new Repository('bazel-central-registry', 'bazelbuild');
    const branch = 'branch_with_entry';
    const tag = 'v1.0.0';

    mockBcrGitHubClient.createPullRequest.mockResolvedValueOnce(4);

    const pr = await publishEntryService.publish(
      tag,
      bcrFork,
      bcr,
      branch,
      ['rules_foo'],
      `github.com/aspect-build/rules_foo/releases/tag/${tag}`
    );

    expect(pr).toEqual(4);
  });

  test('enables auto-merge on the pull request', async () => {
    const bcrFork = new Repository('bazel-central-registry', 'bar');
    const bcr = new Repository('bazel-central-registry', 'bazelbuild');
    const branch = 'branch_with_entry';
    const tag = 'v1.0.0';

    mockBcrGitHubClient.createPullRequest.mockResolvedValueOnce(4);
    mockBcrGitHubClient.enableAutoMerge.mockResolvedValueOnce(undefined);

    await publishEntryService.publish(
      tag,
      bcrFork,
      bcr,
      branch,
      ['rules_foo'],
      `github.com/aspect-build/rules_foo/releases/tag/${tag}`
    );

    expect(mockBcrGitHubClient.enableAutoMerge).toHaveBeenCalled();
  });

  test('does not reject when enabling auto-merge fails', async () => {
    const bcrFork = new Repository('bazel-central-registry', 'bar');
    const bcr = new Repository('bazel-central-registry', 'bazelbuild');
    const branch = 'branch_with_entry';
    const tag = 'v1.0.0';

    mockBcrGitHubClient.createPullRequest.mockResolvedValueOnce(4);
    mockBcrGitHubClient.enableAutoMerge.mockRejectedValueOnce(
      'Failed to enable auto-merge!'
    );

    await expect(
      publishEntryService.publish(
        tag,
        bcrFork,
        bcr,
        branch,
        ['rules_foo'],
        `github.com/aspect-build/rules_foo/releases/tag/${tag}`
      )
    ).resolves.toBe(4);
  });
});

describe('commitEntryToNewBranch', () => {
  test('sets the commit author to the releaser', async () => {
    const tag = 'v1.2.3';
    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;
    const releaser: User = {
      name: 'Json Bearded',
      email: 'json@bearded.ca',
      username: 'json',
    };

    await publishEntryService.commitEntryToNewBranch(
      rulesetRepo,
      bcrRepo,
      tag,
      releaser
    );

    expect(mockGitClient.setUserNameAndEmail).toHaveBeenCalledWith(
      bcrRepo.diskPath,
      releaser.name,
      releaser.email
    );
  });

  test('sets the commit author to the publish-to-bcr bot when the release it the github-actions bot', async () => {
    // https://github.com/bazel-contrib/publish-to-bcr/issues/120
    const tag = 'v1.2.3';
    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;
    const releaser = UserService.fromGitHubUser(
      GitHubClient.GITHUB_ACTIONS_BOT
    );
    const botUser: Partial<GitHubUser> = {
      name: 'publish-to-bcr',
      login: 'publish-to-bcr[bot]',
      email: `12345+"publish-to-bcr[bot]@users.noreply.github.com`,
    };
    const botApp = { slug: 'publish-to-bcr' } as GitHubApp;

    mockBcrGitHubClient.getApp.mockResolvedValue(botApp);
    mockBcrGitHubClient.getBotAppUser.mockResolvedValue(botUser as GitHubUser);

    await publishEntryService.commitEntryToNewBranch(
      rulesetRepo,
      bcrRepo,
      tag,
      releaser
    );

    expect(mockBcrGitHubClient.getApp).toHaveBeenCalled();
    expect(mockBcrGitHubClient.getBotAppUser).toHaveBeenCalledWith(botApp);

    expect(mockGitClient.setUserNameAndEmail).toHaveBeenCalledWith(
      bcrRepo.diskPath,
      botUser.name,
      botUser.email
    );
  });

  test('checks out a new branch on the bcr repo', async () => {
    const tag = 'v1.2.3';
    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;
    const releaser: User = {
      name: 'Json Bearded',
      email: 'json@bearded.ca',
      username: 'json',
    };

    await publishEntryService.commitEntryToNewBranch(
      rulesetRepo,
      bcrRepo,
      tag,
      releaser
    );

    expect(mockGitClient.checkoutNewBranchFromHead).toHaveBeenCalledWith(
      bcrRepo.diskPath,
      expect.any(String)
    );
  });

  test('branch contains the repo name and release tag', async () => {
    const tag = 'v1.2.3';
    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;
    const releaser: User = {
      name: 'Json Bearded',
      email: 'json@bearded.ca',
      username: 'json',
    };

    await publishEntryService.commitEntryToNewBranch(
      rulesetRepo,
      bcrRepo,
      tag,
      releaser
    );

    expect(mockGitClient.checkoutNewBranchFromHead).toHaveBeenCalledTimes(1);
    expect(mockGitClient.checkoutNewBranchFromHead).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(rulesetRepo.canonicalName)
    );
    expect(mockGitClient.checkoutNewBranchFromHead).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(tag)
    );
  });

  test('returns the created branch name', async () => {
    const tag = 'v1.2.3';
    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;
    const releaser: User = {
      name: 'Json Bearded',
      email: 'json@bearded.ca',
      username: 'json',
    };

    const returnedBranch = await publishEntryService.commitEntryToNewBranch(
      rulesetRepo,
      bcrRepo,
      tag,
      releaser
    );
    const createdBranch =
      mockGitClient.checkoutNewBranchFromHead.mock.calls[0][1];

    expect(returnedBranch).toEqual(createdBranch);
  });

  test('commit message contains the repo name and release tag', async () => {
    const tag = 'v1.2.3';
    const rulesetRepo = await RulesetRepository.create('repo', 'owner', tag);
    const bcrRepo = CANONICAL_BCR;
    const releaser: User = {
      name: 'Json Bearded',
      email: 'json@bearded.ca',
      username: 'json',
    };

    await publishEntryService.commitEntryToNewBranch(
      rulesetRepo,
      bcrRepo,
      tag,
      releaser
    );

    expect(mockGitClient.commitChanges).toHaveBeenCalledTimes(1);
    expect(mockGitClient.commitChanges).toHaveBeenCalledWith(
      bcrRepo.diskPath,
      expect.stringContaining(rulesetRepo.canonicalName)
    );
    expect(mockGitClient.commitChanges).toHaveBeenCalledWith(
      bcrRepo.diskPath,
      expect.stringContaining(tag)
    );
  });
});

describe('pushEntryToFork', () => {
  beforeEach(() => {
    // Reduce the exponential-backoff delay to 0 for tests
    (backOff as unknown as jest.SpyInstance).mockImplementation(
      (request: () => Promise<void>, options?: BackoffOptions) =>
        realExponentialBackoff.backOff(request, {
          ...options,
          startingDelay: 0,
        })
    );
  });

  test('acquires an authenticated remote url for the bcr fork', async () => {
    const bcrRepo = CANONICAL_BCR;
    const bcrForkRepo = new Repository('bazel-central-registry', 'aspect');
    const branchName = `repo/owner@v1.2.3`;

    await publishEntryService.pushEntryToFork(
      bcrForkRepo,
      bcrRepo,
      branchName,
      mockBcrForkGitHubClient
    );
    expect(
      mockBcrForkGitHubClient.getAuthenticatedRemoteUrl
    ).toHaveBeenCalledWith(bcrForkRepo.owner, bcrForkRepo.name);
  });

  test('adds a remote with the authenticated url for the fork to the local bcr repo', async () => {
    const bcrRepo = CANONICAL_BCR;
    const bcrForkRepo = new Repository('bazel-central-registry', 'aspect');
    const branchName = `repo/owner@v1.2.3`;
    const authenticatedUrl = randomUUID();

    mockBcrForkGitHubClient.getAuthenticatedRemoteUrl.mockReturnValueOnce(
      Promise.resolve(authenticatedUrl)
    );

    await publishEntryService.pushEntryToFork(
      bcrForkRepo,
      bcrRepo,
      branchName,
      mockBcrForkGitHubClient
    );
    expect(mockGitClient.addRemote).toHaveBeenCalledWith(
      bcrRepo.diskPath,
      expect.any(String),
      authenticatedUrl
    );
  });

  test("named the authenticated remote 'authed-fork'", async () => {
    const bcrRepo = CANONICAL_BCR;
    const bcrForkRepo = new Repository('bazel-central-registry', 'aspect');
    const branchName = `repo/owner@v1.2.3`;
    const authenticatedUrl = randomUUID();

    mockBcrForkGitHubClient.getAuthenticatedRemoteUrl.mockReturnValueOnce(
      Promise.resolve(authenticatedUrl)
    );

    await publishEntryService.pushEntryToFork(
      bcrForkRepo,
      bcrRepo,
      branchName,
      mockBcrForkGitHubClient
    );
    expect(mockGitClient.addRemote).toHaveBeenCalledWith(
      expect.any(String),
      'authed-fork',
      expect.any(String)
    );
  });

  test('does not re-add the remote if it already exists', async () => {
    const bcrRepo = CANONICAL_BCR;
    const bcrForkRepo = new Repository('bazel-central-registry', 'aspect');
    const branchName = `repo/owner@v1.2.3`;
    const authenticatedUrl = randomUUID();

    mockGitClient.hasRemote.mockReturnValueOnce(Promise.resolve(true));
    mockBcrForkGitHubClient.getAuthenticatedRemoteUrl.mockReturnValueOnce(
      Promise.resolve(authenticatedUrl)
    );

    await publishEntryService.pushEntryToFork(
      bcrForkRepo,
      bcrRepo,
      branchName,
      mockBcrForkGitHubClient
    );
    expect(mockGitClient.addRemote).not.toHaveBeenCalled();
  });

  test('pushes the entry branch to the fork using the authorized remote', async () => {
    const bcrRepo = CANONICAL_BCR;
    const bcrForkRepo = new Repository('bazel-central-registry', 'aspect');
    const branchName = `repo/owner@v1.2.3`;

    await publishEntryService.pushEntryToFork(
      bcrForkRepo,
      bcrRepo,
      branchName,
      mockBcrForkGitHubClient
    );

    expect(mockGitClient.push).toHaveBeenCalledWith(
      bcrRepo.diskPath,
      'authed-fork',
      branchName
    );
  });

  test('retries 5 times if it fails', async () => {
    const bcrRepo = CANONICAL_BCR;
    const bcrForkRepo = new Repository('bazel-central-registry', 'aspect');
    const branchName = `repo/owner@v1.2.3`;

    (backOff as unknown as jest.SpyInstance).mockImplementation(
      (request: () => Promise<any>, options?: BackoffOptions) => {
        return realExponentialBackoff.backOff(request, {
          ...options,
          startingDelay: 0,
        });
      }
    );

    mockGitClient.push
      .mockRejectedValueOnce(new Error('failed push'))
      .mockRejectedValueOnce(new Error('failed push'))
      .mockRejectedValueOnce(new Error('failed push'))
      .mockRejectedValueOnce(new Error('failed push'))
      .mockResolvedValueOnce(undefined);

    await publishEntryService.pushEntryToFork(
      bcrForkRepo,
      bcrRepo,
      branchName,
      mockBcrForkGitHubClient
    );

    expect(mockGitClient.push).toHaveBeenCalledTimes(5);
  });

  test('fails after the 5th retry', async () => {
    const bcrRepo = CANONICAL_BCR;
    const bcrForkRepo = new Repository('bazel-central-registry', 'aspect');
    const branchName = `repo/owner@v1.2.3`;

    mockGitClient.push.mockRejectedValue(new Error('failed push'));

    await expect(
      publishEntryService.pushEntryToFork(
        bcrForkRepo,
        bcrRepo,
        branchName,
        mockBcrForkGitHubClient
      )
    ).rejects.toThrow();
    expect(mockGitClient.push).toHaveBeenCalledTimes(5);
  });
});
