import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import { mocked, Mocked } from "jest-mock";
import { GitHubClient } from "../infrastructure/github";
import { CANONICAL_BCR, FindRegistryForkService } from "./find-registry-fork";
import { Repository } from "./repository";
import { RulesetRepository } from "./ruleset-repository";

jest.mock("../infrastructure/github");

let findRegistryForkService: FindRegistryForkService;
let mockGithubClient: Mocked<GitHubClient>;

// Mock RulesetRepostory.create to avoid network call and necessary file checks
const mockRulesetRepoCreate = jest
  .spyOn(RulesetRepository, "create")
  .mockImplementation((name, owner) => {
    return new (RulesetRepository as any)(name, owner);
  });

beforeEach(() => {
  mocked(GitHubClient, true).mockClear();
  mockRulesetRepoCreate.mockClear();

  mockGithubClient = mocked(new GitHubClient());
  findRegistryForkService = new FindRegistryForkService(mockGithubClient);
});

describe("findCandidateForks", () => {
  test("finds fork in same account as ruleset repo", async () => {
    const owner = "foo-company";
    const releaser = { username: "jason", email: "jason@foo.org" };
    const rulesetRepo = await RulesetRepository.create(
      "ruleset",
      owner,
      "main"
    );
    const ownerBcrFork = new Repository("bazel-central-registry", owner);

    mockGithubClient.getForkedRepositoriesByOwner.mockImplementation(
      async (repoOwner) => {
        if (repoOwner === owner) {
          return [new Repository("a", owner), ownerBcrFork];
        }
        return [];
      }
    );

    mockGithubClient.getSourceRepository.mockImplementation(
      async (repository) => {
        if (repository.equals(ownerBcrFork)) {
          return CANONICAL_BCR;
        }
        return repository;
      }
    );

    const forks = await findRegistryForkService.findCandidateForks(
      rulesetRepo,
      releaser
    );

    expect(forks.find((fork) => fork.equals(ownerBcrFork))).toBeTruthy();
  });

  test("finds fork in releaser's account", async () => {
    const owner = "foo-company";
    const releaser = { username: "jason", email: "jason@foo.org" };
    const rulesetRepo = await RulesetRepository.create(
      "ruleset",
      owner,
      "main"
    );
    const releaserBcrFork = new Repository(
      "bazel-central-registry",
      releaser.username
    );

    mockGithubClient.getForkedRepositoriesByOwner.mockImplementation(
      async (repoOwner) => {
        if (repoOwner === releaser.username) {
          return [new Repository("a", releaser.username), releaserBcrFork];
        }
        return [];
      }
    );

    mockGithubClient.getSourceRepository.mockImplementation(
      async (repository) => {
        if (repository.equals(releaserBcrFork)) {
          return CANONICAL_BCR;
        }
        return repository;
      }
    );

    const forks = await findRegistryForkService.findCandidateForks(
      rulesetRepo,
      releaser
    );

    expect(forks.find((fork) => fork.equals(releaserBcrFork))).toBeTruthy();
  });

  test("prioritizes fork in ruleset account before releaser's account", async () => {
    const owner = "foo-company";
    const releaser = { username: "jason", email: "jason@foo.org" };
    const rulesetRepo = await RulesetRepository.create(
      "ruleset",
      owner,
      "main"
    );
    const ownerBcrFork = new Repository("bazel-central-registry", owner);
    const releaserBcrFork = new Repository(
      "bazel-central-registry",
      releaser.username
    );

    mockGithubClient.getForkedRepositoriesByOwner.mockImplementation(
      async (repoOwner) => {
        if (repoOwner === owner) {
          return [new Repository("a", owner), ownerBcrFork];
        } else {
          // repoOwner === releaser
          return [new Repository("b", releaser.username), releaserBcrFork];
        }
      }
    );

    mockGithubClient.getSourceRepository.mockImplementation(
      async (repository) => {
        if (
          repository.equals(releaserBcrFork) ||
          repository.equals(ownerBcrFork)
        ) {
          return CANONICAL_BCR;
        }
        return repository;
      }
    );

    const forks = await findRegistryForkService.findCandidateForks(
      rulesetRepo,
      releaser
    );

    expect(forks.length).toEqual(2);
    expect(forks[0].equals(ownerBcrFork)).toEqual(true);
    expect(forks[1].equals(releaserBcrFork)).toEqual(true);
  });

  test("does not return a fork named bazel-central-registry that is not sourced from the canonical BCR", async () => {
    const owner = "foo-company";
    const releaser = { username: "jason", email: "jason@foo.org" };
    const rulesetRepo = await RulesetRepository.create(
      "ruleset",
      owner,
      "main"
    );
    const ownerBcrFork = new Repository("bazel-central-registry", owner);

    mockGithubClient.getForkedRepositoriesByOwner.mockImplementation(
      async (repoOwner) => {
        if (repoOwner === owner) {
          return [new Repository("a", owner), ownerBcrFork];
        }
        return [];
      }
    );

    mockGithubClient.getSourceRepository.mockImplementation(
      async (repository) => {
        if (repository.equals(ownerBcrFork)) {
          return new Repository("bazel-central-registry", "not-google");
        }
        return repository;
      }
    );

    const forks = await findRegistryForkService.findCandidateForks(
      rulesetRepo,
      releaser
    );

    expect(forks).toEqual([]);
  });
});
