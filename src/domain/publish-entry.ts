import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { backOff } from 'exponential-backoff';

import { GitClient } from '../infrastructure/git.js';
import { GitHubClient } from '../infrastructure/github.js';
import { Repository } from './repository.js';
import { RulesetRepository } from './ruleset-repository.js';
import { User, UserService } from './user.js';

@Injectable()
export class PublishEntryService {
  constructor(
    private readonly gitClient: GitClient,
    @Inject('bcrGitHubClient') private bcrGitHubClient: GitHubClient
  ) {}

  public async commitEntryToNewBranch(
    rulesetRepo: Repository,
    bcrRepo: Repository,
    tag: string,
    releaser: User
  ): Promise<string> {
    const repoAndVersion = `${rulesetRepo.canonicalName}@${tag}`;
    const branchName = `${repoAndVersion}-${randomBytes(4).toString('hex')}`;

    let commitAuthor: Partial<User> = releaser;
    if (UserService.isGitHubActionsBot(releaser)) {
      const botApp = await this.bcrGitHubClient.getApp();
      const botAppUser = await this.bcrGitHubClient.getBotAppUser(botApp);

      commitAuthor = {
        name: botAppUser.name,
        email: botAppUser.email,
      };
    }

    await this.gitClient.setUserNameAndEmail(
      bcrRepo.diskPath,
      commitAuthor.name,
      commitAuthor.email
    );
    console.error(bcrRepo.diskPath);
    console.error(branchName);
    await this.gitClient.checkoutNewBranchFromHead(
      bcrRepo.diskPath,
      branchName
    );
    await this.gitClient.commitChanges(
      bcrRepo.diskPath,
      `Publish ${repoAndVersion}`
    );

    return branchName;
  }

  public async pushEntryToFork(
    bcrForkRepo: Repository,
    bcr: Repository,
    branch: string,
    githubClient: GitHubClient
  ): Promise<void> {
    const authenticatedRemoteUrl = await githubClient.getAuthenticatedRemoteUrl(
      bcrForkRepo.owner,
      bcrForkRepo.name
    );

    if (!(await this.gitClient.hasRemote(bcr.diskPath, 'authed-fork'))) {
      await this.gitClient.addRemote(
        bcr.diskPath,
        'authed-fork',
        authenticatedRemoteUrl
      );
    }

    if (process.env.INTEGRATION_TESTING) {
      // It is too difficult to mock the responses to `git push` when
      // not using a real git server. Just push to the original remote,
      // which, during testing, is just a local repo on disk, so that
      // we can examine the result.
      await this.gitClient.push(bcr.diskPath, 'origin', branch);
      return;
    }

    await backOff(
      () => this.gitClient.push(bcr.diskPath, 'authed-fork', branch),
      {
        numOfAttempts: 5,
      }
    );
  }

  public async publish(
    tag: string,
    bcrForkRepo: Repository,
    bcr: Repository,
    branch: string,
    moduleNames: string[],
    releaseUrl: string
  ): Promise<number> {
    const version = RulesetRepository.getVersionFromTag(tag);
    const pullNumber = await this.bcrGitHubClient.createPullRequest(
      bcrForkRepo.owner,
      branch,
      bcr.owner,
      bcr.name,
      'main',
      moduleNames.map((moduleName) => `${moduleName}@${version}`).join(', '),
      `\
Release: ${releaseUrl}

_Automated by [Publish to BCR](https://github.com/apps/publish-to-bcr)_`
    );

    try {
      await this.bcrGitHubClient.enableAutoMerge(
        bcr.owner,
        bcr.name,
        pullNumber
      );
    } catch {
      console.error(
        `Error: Failed to enable auto-merge on pull request github.com/${bcr.canonicalName}/pull/${pullNumber}.`
      );
    }

    return pullNumber;
  }
}
