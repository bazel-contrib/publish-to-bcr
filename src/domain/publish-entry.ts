import { GitHubClient } from "../infrastructure/github.js";
import { Maintainer } from "./metadata-file.js";
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
    maintainers: ReadonlyArray<Maintainer>,
    moduleName: string,
    releaseUrl: string
  ): Promise<number> {
    const version = RulesetRepository.getVersionFromTag(tag);

    // Only tag maintainers that have a github handle, which is optional:
    // See: https://docs.google.com/document/d/1moQfNcEIttsk6vYanNKIy3ZuK53hQUFq1b1r0rmsYVg/edit#bookmark=id.1i90c6c14zvx
    const maintainersToTag = maintainers
      .filter((m) => !!m.github && m.github !== releaser.username)
      .map((m) => `@${m.github}`);

    const pr = await this.githubClient.createPullRequest(
      bcrForkRepo,
      branch,
      bcr,
      "main",
      `${moduleName}@${version}`,
      `\
Release: [${tag}](${releaseUrl})

Author: @${releaser.username}

${maintainersToTag.length > 0 ? "fyi: " + maintainersToTag.join(", ") : ""}

_Automated by [Publish to BCR](https://github.com/apps/publish-to-bcr)_`
    );

    return pr;
  }
}
