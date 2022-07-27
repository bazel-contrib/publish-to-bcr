import { Octokit } from "@octokit/rest";
import { createAppAuth, StrategyOptions } from "@octokit/auth-app";
import { Repository } from "../domain/repository.js";

export class GitHubClient {
  // Cache installation tokens as they expire after an hour, which is more than
  // enough time for a cloud function to run.
  private readonly _installationTokenCache: any = {};

  private appAuth: StrategyOptions | null = null;

  public setAppAuth(appAuth: StrategyOptions) {
    this.appAuth = appAuth;
  }

  private getOctokit(): Octokit {
    return new Octokit();
  }

  private getAppAuthorizedOctokit(): Octokit {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: this.appAuth,
    });
  }

  private async getRepoAuthorizedOctokit(
    repository: Repository
  ): Promise<Octokit> {
    const token = await this.getInstallationToken(repository);
    return new Octokit({
      auth: token,
    });
  }

  public async getForkedRepositoriesByOwner(
    owner: string
  ): Promise<Repository[]> {
    // This endpoint works for org owners as well as user owners
    const response = await this.getOctokit().rest.repos.listForUser({
      username: owner,
      type: "owner",
      per_page: 100,
    });

    return response.data
      .filter((repo) => repo.fork)
      .map((repo) => new Repository(repo.name, repo.owner.login));
  }

  public async getSourceRepository(
    repository: Repository
  ): Promise<Repository | null> {
    const response = await this.getOctokit().rest.repos.get({
      owner: repository.owner,
      repo: repository.name,
    });

    const repo = response.data;
    if (repo.source) {
      return new Repository(repo.source.name, repo.source.owner.login);
    }
    return null;
  }

  public async createPullRequest(
    fromRepo: Repository,
    fromBranch: string,
    toRepo: Repository,
    toBranch: string,
    title: string
  ): Promise<number> {
    const app = await this.getRepoAuthorizedOctokit(toRepo);
    const { data: pull } = await app.rest.pulls.create({
      owner: toRepo.owner,
      repo: toRepo.name,
      title: title,
      body: "Automated by [Publish to BCR](https://github.com/apps/publish-to-bcr).",
      head: `${fromRepo.owner}:${fromBranch}`,
      base: toBranch,
      maintainer_can_modify: false,
    });

    return pull.number;
  }

  public async requestReview(
    repository: Repository,
    pullNumber: number,
    reviewers: string[]
  ): Promise<void> {
    const octokit = await this.getRepoAuthorizedOctokit(repository);
    await octokit.rest.pulls.requestReviewers({
      owner: repository.owner,
      repo: repository.name,
      pull_number: pullNumber,
      reviewers: reviewers,
    });
  }

  private async getRepositoryInstallation(
    repository: Repository
  ): Promise<any> {
    const octokit = this.getAppAuthorizedOctokit();
    const { data: installation } = await octokit.rest.apps.getRepoInstallation({
      owner: repository.owner,
      repo: repository.name,
    });

    if (!installation) {
      throw new Error(
        `Could not access app installation for repo ${repository.canonicalName}`
      );
    }

    return installation;
  }

  public async getInstallationToken(repository: Repository): Promise<string> {
    if (!this._installationTokenCache[repository.canonicalName]) {
      const installationId = (await this.getRepositoryInstallation(repository))
        .id;

      const octokit = this.getAppAuthorizedOctokit();
      const auth = (await octokit.auth({
        type: "installation",
        installationId: installationId,
        repositoryNames: [repository.name],
      })) as any;

      this._installationTokenCache[repository.canonicalName] = auth.token;
    }

    return this._installationTokenCache[repository.canonicalName];
  }

  public async getAuthenticatedRemoteUrl(
    repository: Repository
  ): Promise<string> {
    const token = await this.getInstallationToken(repository);
    return `https://x-access-token:${token}@github.com/${repository.canonicalName}.git`;
  }
}
