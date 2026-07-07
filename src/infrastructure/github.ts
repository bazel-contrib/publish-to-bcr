import { Octokit } from '@octokit/rest';
import { Endpoints } from '@octokit/types';

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

  public constructor(private readonly octokit?: Octokit) {}

  public async getRepository(owner: string, repo: string): Promise<Repository> {
    const { data: repository } = await this.octokit.rest.repos.get({
      owner,
      repo,
    });

    return repository;
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
}
