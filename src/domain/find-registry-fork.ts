import { Injectable } from "@nestjs/common";
import { UserFacingError } from "./error.js";
import { Repository, RepositoryService } from "./repository.js";
import { RulesetRepository } from "./ruleset-repository.js";
import { User } from "./user.js";

export const CANONICAL_BCR = new Repository(
  "bazel-central-registry",
  "bazelbuild"
);

export class NoCandidateForksError extends UserFacingError {
  constructor(public readonly rulesetRepo: RulesetRepository) {
    super(`\
Could not find a candidate bazel-central-registry fork to push to.
Publish to BCR must be installed to a BCR fork in either:
  a) the same account as the ruleset
  b) the release author's account
Install the app here: https://github.com/apps/publish-to-bcr.`);
  }
}

@Injectable()
export class FindRegistryForkService {
  constructor(private repositoryService: RepositoryService) {}

  // Find potential bcr forks that can be pushed to. Will return a fork
  // owned by the ruleset owner, followed by a fork owned by the releaser,
  // if either exist.
  public async findCandidateForks(
    rulesetRepo: RulesetRepository,
    releaser: User
  ): Promise<Repository[]> {
    const potentialForkOwners = new Set<string>();
    potentialForkOwners.add(rulesetRepo.owner);
    potentialForkOwners.add(releaser.username);

    const allForks = (
      await Promise.all(
        Array.from(potentialForkOwners.values()).map((owner) =>
          this.repositoryService.getForkedRepositoriesByOwner(owner)
        )
      )
    ).reduce((acc, curr) => acc.concat(curr), []);

    let candidateForks = allForks.filter(
      (repo) => repo.name === "bazel-central-registry"
    );

    // Only consider forks named `bazel-central-registry`
    const sourceRepos = await Promise.all(
      candidateForks.map((fork) =>
        this.repositoryService.getSourceRepository(fork)
      )
    );
    candidateForks = candidateForks.filter((_, index) =>
      sourceRepos[index].equals(CANONICAL_BCR)
    );

    // Filter out BCR forks that don't have the app installed
    const appInstalledToFork = await Promise.all(
      candidateForks.map((fork) =>
        this.repositoryService.hasAppInstallation(fork)
      )
    );
    candidateForks = candidateForks.filter(
      (_, index) => appInstalledToFork[index]
    );

    if (!candidateForks.length) {
      throw new NoCandidateForksError(rulesetRepo);
    }
    return candidateForks;
  }
}
