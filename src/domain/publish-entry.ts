import { Inject, Injectable } from "@nestjs/common";
import { GitHubClient } from "../infrastructure/github.js";
import { Repository } from "./repository.js";
import { RulesetRepository } from "./ruleset-repository.js";

@Injectable()
export class PublishEntryService {
  constructor(@Inject("bcrGitHubClient") private githubClient: GitHubClient) {}

  public async sendRequest(
    tag: string,
    bcrForkRepo: Repository,
    bcr: Repository,
    branch: string,
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
Release: ${releaseUrl}

_Automated by [Publish to BCR](https://github.com/apps/publish-to-bcr)_`
    );

    return pr;
  }
}
