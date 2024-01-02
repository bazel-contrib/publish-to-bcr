import { createAppAuth, StrategyOptions } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { Repository } from "../domain/repository.js";
import { User } from "../domain/user.js";

export class MissingRepositoryInstallationError extends Error {
  constructor(repository: Repository) {
    super(`Missing installation for repository ${repository.canonicalName}`);
  }
}

export class GitHubClient {
  // The GitHub API does not return a name or an email for the github-actions[bot].
  // See https://api.github.com/users/github-actions%5Bbot%5D
  // Yet, an email and a name are implicitly set when the bot is an author of a
  // commit. Hardcode the (stable) name and email so that we can also author commits
  // as the GitHub actions bot.
  // See https://github.com/orgs/community/discussions/26560#discussioncomment-3252340.
  public static readonly GITHUB_ACTIONS_BOT: User = {
    username: "github-actions[bot]",
    name: "github-actions[bot]",
    email: "41898282+github-actions[bot]@users.noreply.github.com",
  };

  // Cache installation tokens as they expire after an hour, which is more than
  // enough time for a cloud function to run.
  private readonly _installationTokenCache: any = {};

  private appAuth: StrategyOptions | null = null;

  public setAppAuth(appAuth: StrategyOptions) {
    this.appAuth = appAuth;
  }

  private getOctokit(): Octokit {
    return new Octokit({
      ...((process.env.INTEGRATION_TESTING && {
        baseUrl: process.env.GITHUB_API_ENDPOINT,
      }) ||
        {}),
    });
  }

  private getAppAuthorizedOctokit(): Octokit {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: this.appAuth,
      ...((process.env.INTEGRATION_TESTING && {
        baseUrl: process.env.GITHUB_API_ENDPOINT,
      }) ||
        {}),
    });
  }

  private async getRepoAuthorizedOctokit(
    repository: Repository
  ): Promise<Octokit> {
    const token = await this.getInstallationToken(repository);
    return new Octokit({
      auth: token,
      ...((process.env.INTEGRATION_TESTING && {
        baseUrl: process.env.GITHUB_API_ENDPOINT,
      }) ||
        {}),
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
    title: string,
    body: string
  ): Promise<number> {
    const app = await this.getRepoAuthorizedOctokit(toRepo);
    const { data: pull } = await app.rest.pulls.create({
      owner: toRepo.owner,
      repo: toRepo.name,
      title: title,
      body,
      head: `${fromRepo.owner}:${fromBranch}`,
      base: toBranch,
      maintainer_can_modify: false,
    });

    return pull.number;
  }

  public async getRepoUser(
    username: string,
    repository: Repository
  ): Promise<User> {
    if (username === GitHubClient.GITHUB_ACTIONS_BOT.username) {
      return GitHubClient.GITHUB_ACTIONS_BOT;
    }
    const octokit = await this.getRepoAuthorizedOctokit(repository);
    const { data } = await octokit.rest.users.getByUsername({ username });
    return { name: data.name, username, email: data.email };
  }

  public async hasAppInstallation(repository: Repository): Promise<boolean> {
    try {
      await this.getRepositoryInstallation(repository);
      return true;
    } catch (error) {
      if (error instanceof MissingRepositoryInstallationError) {
        return false;
      }
      throw error;
    }
  }

  private async getRepositoryInstallation(
    repository: Repository
  ): Promise<any> {
    const octokit = this.getAppAuthorizedOctokit();
    try {
      const { data: installation } =
        await octokit.rest.apps.getRepoInstallation({
          owner: repository.owner,
          repo: repository.name,
        });
      return installation;
    } catch (error) {
      if (error.status === 404) {
        throw new MissingRepositoryInstallationError(repository);
      }
      throw new Error(
        `Could not access app installation for repo ${repository.canonicalName}; returned status ${status}`
      );
    }
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
