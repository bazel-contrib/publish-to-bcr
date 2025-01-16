import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { Endpoints } from '@octokit/types';

export type Installation =
  Endpoints['GET /repos/{owner}/{repo}/installation']['response']['data'];
export type GitHubApp = Endpoints['GET /app']['response']['data'];
export type User = Endpoints['GET /users/{username}']['response']['data'];
export type Repository =
  Endpoints['GET /repos/{owner}/{repo}']['response']['data'];

export class MissingRepositoryInstallationError extends Error {
  constructor(owner: string, repo: string) {
    super(`Missing installation for repository ${owner}/${repo}`);
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
    type: 'installation',
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
  public static readonly GITHUB_ACTIONS_BOT: Readonly<User> = {
    id: 41898282,
    login: 'github-actions[bot]',
    name: 'github-actions[bot]',
    email: '41898282+github-actions[bot]@users.noreply.github.com',
  } as User;

  public static async forRepoInstallation(
    appOctokit: Octokit,
    owner: string,
    repo: string,
    installationId?: number
  ): Promise<GitHubClient> {
    if (installationId === undefined) {
      const appClient = new GitHubClient(appOctokit);
      const installation = await appClient.getRepositoryInstallation(
        owner,
        repo
      );
      installationId = installation.id;
    }

    const installationOctokit = await getInstallationAuthorizedOctokit(
      appOctokit,
      installationId,
      repo
    );
    const client = new GitHubClient(installationOctokit);

    return client;
  }

  public constructor(private readonly octokit: Octokit) {}

  public async listRepositoriesForUser(owner: string): Promise<Repository[]> {
    // This endpoint works for org owners as well as user owners
    const { data: repositories } = await this.octokit.rest.repos.listForUser({
      username: owner,
      type: 'owner',
      per_page: 100,
    });

    return repositories.map((repo) => repo as Repository);
  }

  public async getRepository(owner: string, repo: string): Promise<Repository> {
    const { data: repository } = await this.octokit.rest.repos.get({
      owner,
      repo,
    });

    return repository;
  }

  public async createPullRequest(
    fromOwner: string,
    fromBranch: string,
    toOwner: string,
    toRepo: string,
    toBranch: string,
    title: string,
    body: string
  ): Promise<number> {
    const { data: pull } = await this.octokit.rest.pulls.create({
      owner: toOwner,
      repo: toRepo,
      title: title,
      body,
      head: `${fromOwner}:${fromBranch}`,
      base: toBranch,
      maintainer_can_modify: false,
    });

    return pull.number;
  }

  public async enableAutoMerge(
    owner: string,
    repo: string,
    pullNumber: number
  ) {
    await this.octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      allow_auto_merge: true,
    });
  }

  public async getUserByUsername(username: string): Promise<User> {
    if (username === GitHubClient.GITHUB_ACTIONS_BOT.login) {
      return GitHubClient.GITHUB_ACTIONS_BOT;
    }
    const { data: user } = await this.octokit.rest.users.getByUsername({
      username,
    });
    return user;
  }

  public async hasAppInstallation(
    owner: string,
    repo: string
  ): Promise<boolean> {
    try {
      await this.getRepositoryInstallation(owner, repo);
      return true;
    } catch (error) {
      if (error instanceof MissingRepositoryInstallationError) {
        return false;
      }
      throw error;
    }
  }

  public async getRepositoryInstallation(
    owner: string,
    repo: string
  ): Promise<Installation> {
    try {
      const { data: installation } =
        await this.octokit.rest.apps.getRepoInstallation({
          owner,
          repo,
        });
      return installation;
    } catch (error) {
      if (error.status === 404) {
        throw new MissingRepositoryInstallationError(owner, repo);
      }
      throw new Error(
        `Could not access app installation for repo ${owner}/${repo}; returned status ${status}`
      );
    }
  }

  public async getInstallationToken(
    owner: string,
    repo: string
  ): Promise<string> {
    const installationId = (await this.getRepositoryInstallation(owner, repo))
      .id;

    const auth = (await this.octokit.auth({
      type: 'installation',
      installationId: installationId,
      repositoryNames: [repo],
    })) as any;

    return auth.token;
  }

  public async getAuthenticatedRemoteUrl(
    owner: string,
    repo: string
  ): Promise<string> {
    const token = await this.getInstallationToken(owner, repo);
    return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
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
      ...user,
      name: botApp.slug,
      login: botUsername,
      email: `${user.id}+${botUsername}@users.noreply.github.com`,
    };
  }
}
