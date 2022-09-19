import { GitHubClient } from "../infrastructure/github.js";
import { Repository } from "./repository.js";
import { User } from "./user.js";

export class PublishEntryService {
  constructor(private readonly githubClient: GitHubClient) {}

  public async sendRequest(
    rulesetRepo: Repository,
    tag: string,
    bcrForkRepo: Repository,
    bcr: Repository,
    branch: string,
    releaser: User
  ): Promise<number> {
    const pr = await this.githubClient.createPullRequest(
      bcrForkRepo,
      branch,
      bcr,
      "main",
      `${rulesetRepo.canonicalName}@${tag}`,
      `\
Release author: @${releaser.username}.

Automated by [Publish to BCR](https://github.com/apps/publish-to-bcr).`
    );

    return pr;
  }
}
