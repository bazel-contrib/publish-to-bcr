import { User } from "@octokit/webhooks-types";
import { randomInt, randomUUID } from "crypto";
import * as mockttp from "mockttp";
import url from "node:url";
import { StubbedServer } from "./stubbed-server";

/**
 * Standin GitHub API and server for release archive downloads.
 */
export class FakeGitHub implements StubbedServer {
  private readonly server: mockttp.Mockttp;
  private readonly appInstallations = new Map<string, number>();
  private readonly botAppInstallations = new Map<string, number>();
  private readonly users = new Map<string, Partial<User>>();
  private readonly ownedRepos = new Map<string, string[]>();
  private readonly repositories = new Map<
    string,
    { owner: string; repo: string; sourceOwner?: string; sourceRepo?: string }
  >();

  public readonly pullRequestHandler = jest.fn();
  public readonly installationTokenHandler = jest.fn();

  public constructor() {
    this.server = mockttp.getLocal();
  }

  public async start() {
    await this.server.start();
    await this.setupHandlers();
  }

  private async setupHandlers(): Promise<void> {
    await Promise.all([
      this.setupGetInstallationsHandler(),
      this.setupGetInstallationTokenHandler(),
      this.setupGetUserHandler(),
      this.setupGetOwnedReposHandler(),
      this.setupGetRepoHandler(),
      this.setupCreatePullHandler(),
    ]);
  }

  public async reset(): Promise<void> {
    this.server.reset();
    this.clearMockedData();
    this.pullRequestHandler.mockReset();
    this.installationTokenHandler.mockReset();
    await this.setupHandlers();
  }

  public async shutdown() {
    await this.server.stop();
    this.clearMockedData();
  }

  public getHost(): string {
    return url.parse(this.server.url).hostname!;
  }

  public getPort(): number {
    return this.server.port;
  }

  public getBaseUrl(): string {
    return this.server.url;
  }

  private clearMockedData(): void {
    this.appInstallations.clear();
    this.botAppInstallations.clear();
    this.users.clear();
    this.ownedRepos.clear();
    this.repositories.clear();
  }

  public mockAppInstallation(owner: string, repo: string): number {
    const installationId = randomInt(50000);
    this.appInstallations.set(`${owner}/${repo}`, installationId);
    return installationId;
  }

  public mockBotAppInstallation(owner: string, repo: string): number {
    const installationId = randomInt(50000);
    this.botAppInstallations.set(`${owner}/${repo}`, installationId);
    return installationId;
  }

  public mockUser(user: Partial<User>) {
    this.users.set(user.login!, user);
    if (!this.ownedRepos.has(user.login!)) {
      this.ownedRepos.set(user.login!, []);
    }
  }

  public mockRepository(
    owner: string,
    repo: string,
    sourceOwner?: string,
    sourceRepo?: string
  ) {
    this.repositories.set(`${owner}/${repo}`, {
      owner,
      repo,
      sourceOwner,
      sourceRepo,
    });
    if (!this.ownedRepos.has(owner)) {
      this.ownedRepos.set(owner, []);
    }
    this.ownedRepos.get(owner)!.push(repo);
  }

  public async mockReleaseArchive(
    urlPath: string,
    filepath: string
  ): Promise<void> {
    await this.server
      .forGet(this.server.urlFor(urlPath))
      .thenFromFile(200, filepath);
  }

  private async setupGetInstallationsHandler(): Promise<void> {
    const pattern = /\/repos\/(.+)\/(.+)\/installation/;
    await this.server.forGet(pattern).thenCallback((request) => {
      const match = request.path.match(pattern);
      const [, owner, repo] = match!;

      const canonicalName = `${owner}/${repo}`;

      if (
        this.appInstallations.has(canonicalName) ||
        this.botAppInstallations.has(canonicalName)
      ) {
        return {
          json: {
            id:
              this.appInstallations.get(canonicalName) ||
              this.botAppInstallations.get(canonicalName),
          },
          statusCode: 200,
        };
      }

      return {
        statusCode: 404,
      };
    });
  }

  private async setupGetInstallationTokenHandler(): Promise<void> {
    const pattern = /\/app\/installations\/(.+)\/access_tokens/;

    this.installationTokenHandler.mockImplementation((request) => {
      const match = request.path.match(pattern);
      const installationId = Number(match![1]);

      if (
        [
          ...this.appInstallations.values(),
          ...this.botAppInstallations.values(),
        ].includes(installationId)
      ) {
        return {
          json: {
            token: randomUUID(),
          },
          statusCode: 201,
        };
      }

      return {
        statusCode: 404,
      };
    });

    await this.server
      .forPost(pattern)
      .thenCallback((request) => this.installationTokenHandler(request));
  }

  private async setupGetUserHandler(): Promise<void> {
    const pattern = /\/users\/([^/]+)$/;
    await this.server.forGet(pattern).thenCallback((request) => {
      const match = request.path.match(pattern);
      const login = match![1];

      if (this.users.has(login)) {
        return {
          json: this.users.get(login),
          statusCode: 201,
        };
      }

      return {
        statusCode: 404,
      };
    });
  }

  private async setupGetOwnedReposHandler(): Promise<void> {
    const pattern = /\/users\/([^/]+)\/repos/;
    await this.server.forGet(pattern).thenCallback((request) => {
      const match = request.path.match(pattern);
      const owner = decodeURIComponent(match![1]);

      if (this.ownedRepos.has(owner)) {
        return {
          json: this.ownedRepos.get(owner)!.map((repo) => ({
            name: repo,
            owner: {
              login: owner,
            },
            fork: !!this.repositories.get(`${owner}/${repo}`)?.sourceOwner,
          })),
          statusCode: 200,
        };
      }

      return {
        statusCode: 404,
      };
    });
  }

  private async setupGetRepoHandler(): Promise<void> {
    const pattern = /\/repos\/([^/]+)\/([^/]+)$/;
    this.server.forGet(pattern).thenCallback((request) => {
      const match = request.path.match(pattern);
      const [, owner, repo] = match!;

      const canonicalName = `${owner}/${repo}`;

      if (this.repositories.has(canonicalName)) {
        const repository = this.repositories.get(canonicalName)!;
        return {
          json: {
            name: repository.repo,
            owner: {
              login: owner,
            },
            ...((repository.sourceOwner && {
              source: {
                name: repository.sourceRepo,
                owner: {
                  login: repository.sourceOwner,
                },
              },
            }) ||
              {}),
          },
          statusCode: 200,
        };
      }

      return {
        statusCode: 404,
      };
    });
  }

  private async setupCreatePullHandler(): Promise<void> {
    this.pullRequestHandler.mockImplementation((request) => {
      return {
        statusCode: 201,
        body: "{}",
      };
    });

    await this.server
      .forPost("/repos/bazelbuild/bazel-central-registry/pulls")
      .thenCallback((request) => this.pullRequestHandler(request));
  }
}
