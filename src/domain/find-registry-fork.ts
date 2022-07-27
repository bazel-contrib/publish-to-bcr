import { GitHubClient } from "../infrastructure/github.js";
import { Repository } from "./repository.js";
import { RulesetRepository } from "./ruleset-repository.js";

const CANONICAL_BCR = "bazelbuild/bazel-central-registry";

export class FindRegistryForkService {
  constructor(private readonly githubClient: GitHubClient) {}

  // Find potential bcr forks that can be pushed to. Will return a fork
  // owned by the ruleset owner, followed by a fork owned by the releaser,
  // if either exist.
  public async findCandidateForks(
    rulesetRepo: RulesetRepository,
    releaser: string
  ): Promise<Repository[]> {
    const potentialForkOwners = new Set<string>();
    potentialForkOwners.add(rulesetRepo.owner);
    potentialForkOwners.add(releaser);

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

    const verifiedCandidateForks = candidateForks.filter(
      (bcrFork, index) =>
        candidateForkSourceRepos[index].canonicalName === CANONICAL_BCR
    );
    return verifiedCandidateForks;
  }
}
