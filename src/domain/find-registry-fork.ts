import { GitHubClient } from "../infrastructure/github.js";
import { UserFacingError } from "./error.js";
import { Repository } from "./repository.js";
import { RulesetRepository } from "./ruleset-repository.js";
import { User } from "./user.js";

export const CANONICAL_BCR = new Repository(
  "bazel-central-registry",
  "bazelbuild"
);

export class NoCandidateForksError extends UserFacingError {
  constructor(public readonly rulesetRepo: RulesetRepository) {
    super(
      `Could not find candidate bazel-central-registry forks to push to. Did you configure the GitHub app for a BCR with the same owner as your ruleset, or for you personal fork? https://github.com/apps/publish-to-bcr.`
    );
  }
}

export class FindRegistryForkService {
  constructor(private readonly githubClient: GitHubClient) {}

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
          this.githubClient.getForkedRepositoriesByOwner(owner)
        )
      )
    ).reduce((acc, curr) => acc.concat(curr), []);

    const candidateForks = allForks.filter(
      (repo) => repo.name === "bazel-central-registry"
    );

    const candidateForkSourceRepos = await Promise.all(
      candidateForks.map((fork) => this.githubClient.getSourceRepository(fork))
    );

    const verifiedCandidateForks = candidateForks.filter((bcrFork, index) =>
      candidateForkSourceRepos[index].equals(CANONICAL_BCR)
    );

    if (!verifiedCandidateForks.length) {
      throw new NoCandidateForksError(rulesetRepo);
    }
    return verifiedCandidateForks;
  }
}
