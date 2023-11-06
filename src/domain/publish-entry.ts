import { GitHubClient } from "../infrastructure/github.js";
import { Repository } from "./repository.js";
import { RulesetRepository } from "./ruleset-repository.js";
import { User } from "./user.js";

export class PublishEntryService {
  constructor(private readonly githubClient: GitHubClient) {}

  public async sendRequest(
    tag: string,
    bcrForkRepo: Repository,
    bcr: Repository,
    branch: string,
    releaser: User,
    moduleName: string,
    releaseUrl: string
  ): Promise<number> {
    const version = RulesetRepository.getVersionFromTag(tag);

    const pr = await this.githubClient.createPullRequest(
      bcrForkRepo,
      branch,
      bcr,
      "main",
      `${moduleName}@${version}`,
      `\
Release: [${tag}](${releaseUrl})

Author: @${releaser.username}.

Automated by [Publish to BCR](https://github.com/apps/publish-to-bcr).`
    );

    return pr;
  }
}
