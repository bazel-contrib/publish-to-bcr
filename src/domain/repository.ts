import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import { GitClient } from '../infrastructure/git.js';
import { GitHubClient } from '../infrastructure/github.js';

export class Repository {
  private _diskPath: string | null = null;

  public static fromCanonicalName(canonicalName: string) {
    const tokens = canonicalName.split('/');
    if (tokens.length !== 2 || !tokens[0].length || !tokens[1].length) {
      throw new Error(
        `Invalid GitHub repository canonical name '${canonicalName}'; expected format owner/repo`
      );
    }
    const [owner, name] = tokens;
    const repository = new Repository(name, owner);
    return repository;
  }

  constructor(
    public readonly name: string,
    public readonly owner: string
  ) {}

  public get canonicalName(): string {
    return `${this.owner}/${this.name}`;
  }

  public get url(): string {
    if (process.env.INTEGRATION_TESTING) {
      // During integration testing all remote repos are instead
      // sourced from defiend disk path.
      return path.join(process.env.PREPARED_FIXTURES_PATH, this.name);
    }
    return `https://github.com/${this.canonicalName}.git`;
  }

  public isCheckedOut(): boolean {
    return this._diskPath != null;
  }

  public get diskPath(): string {
    if (!this.isCheckedOut()) {
      throw new Error(`Repository ${this.canonicalName} is not checked out`);
    }
    return this._diskPath;
  }

  public async shallowCloneAndCheckout(branchOrTag?: string): Promise<void> {
    const gitClient = new GitClient();
    if (!this.isCheckedOut()) {
      this._diskPath = path.join(os.tmpdir(), randomUUID(), this.name);
      await gitClient.shallowClone(this.url, this._diskPath, branchOrTag);
    }
  }

  public cleanup(): void {
    if (this.isCheckedOut()) {
      fs.rmSync(this._diskPath, { recursive: true });
      this._diskPath = null;
    }
  }

  public equals(other: Repository): boolean {
    return this.name == other.name && this.owner === other.owner;
  }
}

@Injectable()
export class RepositoryService {
  constructor(
    @Inject('rulesetRepoGitHubClient') private githubClient: GitHubClient
  ) {}

  public async getSourceRepository(
    repository: Repository
  ): Promise<Repository | null> {
    const repo = await this.githubClient.getRepository(
      repository.owner,
      repository.name
    );
    if (repo.source) {
      return new Repository(repo.source.name, repo.source.owner.login);
    }
    return null;
  }

  public async getForkedRepositoriesByOwner(
    owner: string
  ): Promise<Repository[]> {
    const repositories = await this.githubClient.listRepositoriesForUser(owner);

    return repositories
      .filter((repo) => repo.fork)
      .map((repo) => new Repository(repo.name, repo.owner.login));
  }

  public async hasAppInstallation(repository: Repository): Promise<boolean> {
    return this.githubClient.hasAppInstallation(
      repository.owner,
      repository.name
    );
  }
}
