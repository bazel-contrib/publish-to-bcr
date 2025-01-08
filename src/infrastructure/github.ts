import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { Endpoints } from "@octokit/types";
import { Repository } from "../domain/repository.js";
import { User } from "../domain/user.js";

export type Installation =
  Endpoints["GET /repos/{owner}/{repo}/installation"]["response"]["data"];
export type GitHubApp = Endpoints["GET /app"]["response"]["data"];

export class MissingRepositoryInstallationError extends Error {
  constructor(repository: Repository) {
    super(`Missing installation for repository ${repository.canonicalName}`);
  }
}

export function getUnauthorizedOctokit(): Octokit {
  return new Octokit({
    ...((process.env.INTEGRATION_TESTING && {
      baseUrl: process.env.GITHUB_API_ENDPOINT,
    }) ||
      {}),
  });
}

export function getAppAuthorizedOctokit(
  appId: number,
  privateKey: string,
  clientId: string,
  clientSecret: string
): Octokit {
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: appId,
      privateKey: privateKey,
      clientId: clientId,
      clientSecret: clientSecret,
    },
    ...((process.env.INTEGRATION_TESTING && {
      baseUrl: process.env.GITHUB_API_ENDPOINT,
    }) ||
      {}),
  });
}

export async function getInstallationAuthorizedOctokit(
  appOctokit: Octokit,
  installationId: number,
  repository: string
): Promise<Octokit> {
  const octokit = await appOctokit.auth({
    type: "installation",
    installationId,
    repositoryNames: [repository],
    factory: (auth: any) =>
      new Octokit({
        authStrategy: createAppAuth,
        auth,
        ...((process.env.INTEGRATION_TESTING && {
          baseUrl: process.env.GITHUB_API_ENDPOINT,
        }) ||
          {}),
      }),
  });

  return octokit as any as Octokit;
}

export class GitHubClient {
  // The GitHub API does not return a name or an email for the github-actions[bot].
  // See https://api.github.com/users/github-actions%5Bbot%5D
  // Yet, an email and a name are implicitly set when the bot is an author of a
  // commit. Hardcode the (stable) name and email so that we can also author commits
  // as the GitHub actions bot.
  // See https://github.com/orgs/community/discussions/26560#discussioncomment-3252340.
  public static readonly GITHUB_ACTIONS_BOT: User = {
    id: 41898282,
    username: "github-actions[bot]",
    name: "github-actions[bot]",
    email: "41898282+github-actions[bot]@users.noreply.github.com",
  };

  public static async forRepoInstallation(
    appOctokit: Octokit,
    repository: Repository,
    installationId?: number
  ): Promise<GitHubClient> {
    if (installationId === undefined) {
      const appClient = new GitHubClient(appOctokit);
      const installation = await appClient.getRepositoryInstallation(
        repository
      );
      installationId = installation.id;
    }

    const installationOctokit = await getInstallationAuthorizedOctokit(
      appOctokit,
      installationId,
      repository.name
    );
    const client = new GitHubClient(installationOctokit);

    return client;
  }

  public constructor(private readonly octokit: Octokit) {}

  public async getForkedRepositoriesByOwner(
    owner: string
  ): Promise<Repository[]> {
    // This endpoint works for org owners as well as user owners
    const response = await this.octokit.rest.repos.listForUser({
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
    const response = await this.octokit.rest.repos.get({
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
    const { data: pull } = await this.octokit.rest.pulls.create({
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

  public async enableAutoMerge(repo: Repository, pullNumber: number) {
    await this.octokit.rest.pulls.update({
      owner: repo.owner,
      repo: repo.name,
      pull_number: pullNumber,
      allow_auto_merge: true,
    });
  }

  public async getRepoUser(
    username: string,
    repository: Repository
  ): Promise<User> {
    if (username === GitHubClient.GITHUB_ACTIONS_BOT.username) {
      return GitHubClient.GITHUB_ACTIONS_BOT;
    }
    const { data } = await this.octokit.rest.users.getByUsername({ username });
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

  public async getRepositoryInstallation(
    repository: Repository
  ): Promise<Installation> {
    try {
      const { data: installation } =
        await this.octokit.rest.apps.getRepoInstallation({
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
    const installationId = (await this.getRepositoryInstallation(repository))
      .id;

    const auth = (await this.octokit.auth({
      type: "installation",
      installationId: installationId,
      repositoryNames: [repository.name],
    })) as any;

    return auth.token;
  }

  public async getAuthenticatedRemoteUrl(
    repository: Repository
  ): Promise<string> {
    const token = await this.getInstallationToken(repository);
    return `https://x-access-token:${token}@github.com/${repository.canonicalName}.git`;
  }

  public async getApp(): Promise<GitHubApp> {
    try {
      const response = await this.octokit.apps.getAuthenticated();
      return response.data;
    } catch (e) {
      throw new Error(`Could not authenticated app: ${e.message}`);
    }
  }

  public async getBotAppUser(botApp: GitHubApp): Promise<User> {
    const botUsername = `${botApp.slug}[bot]`;

    // Lookup the user to get the user id, which is needed to
    // form the correct email.
    const { data: user } = await this.octokit.rest.users.getByUsername({
      username: botUsername,
    });

    return {
      name: botApp.slug,
      username: botUsername,
      email: `${user.id}+${botUsername}@users.noreply.github.com`,
    };
  }
}
