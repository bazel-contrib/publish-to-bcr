import { Inject, Injectable } from '@nestjs/common';

import { GitHubClient, User as GitHubUser } from '../infrastructure/github.js';

export interface User {
  readonly id?: number;
  readonly name?: string;
  readonly username: string;
  readonly email: string;
}

@Injectable()
export class UserService {
  constructor(
    @Inject('unauthedGitHubClient') private githubClient: GitHubClient
  ) {}

  public static isGitHubActionsBot(user: User): boolean {
    return user.username === GitHubClient.GITHUB_ACTIONS_BOT.login;
  }

  public static fromGitHubUser(user: GitHubUser): User {
    return {
      id: user.id,
      name: user.name,
      username: user.login,
      email: user.email,
    };
  }

  public async getUser(username: string): Promise<User> {
    const user = await this.githubClient.getUserByUsername(username);
    return UserService.fromGitHubUser(user);
  }
}
