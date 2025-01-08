import { mocked, Mocked } from "jest-mock";
import { GitHubClient } from "../infrastructure/github";
import { expectThrownError } from "../test/util";
import {
  CANONICAL_BCR,
  FindRegistryForkService,
  NoCandidateForksError,
} from "./find-registry-fork";
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
  mocked(GitHubClient).mockClear();
  mockRulesetRepoCreate.mockClear();

  mockGithubClient = mocked(new GitHubClient({} as any));
  findRegistryForkService = new FindRegistryForkService(mockGithubClient);
});

describe("findCandidateForks", () => {
  test("finds fork in same account as ruleset repo", async () => {
    const owner = "foo-company";
    const releaser = {
      name: "Json Bearded",
      username: "json",
      email: "jason@foo.org",
    };
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

    mockGithubClient.hasAppInstallation.mockImplementation(async (repository) =>
      repository.equals(ownerBcrFork)
    );

    const forks = await findRegistryForkService.findCandidateForks(
      rulesetRepo,
      releaser
    );

    expect(forks.find((fork) => fork.equals(ownerBcrFork))).toBeTruthy();
  });

  test("finds fork in releaser's account", async () => {
    const owner = "foo-company";
    const releaser = {
      name: "Json Bearded",
      username: "json",
      email: "jason@foo.org",
    };
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

    mockGithubClient.hasAppInstallation.mockImplementation(async (repository) =>
      repository.equals(releaserBcrFork)
    );

    const forks = await findRegistryForkService.findCandidateForks(
      rulesetRepo,
      releaser
    );

    expect(forks.find((fork) => fork.equals(releaserBcrFork))).toBeTruthy();
  });

  test("prioritizes fork in ruleset account before releaser's account", async () => {
    const owner = "foo-company";
    const releaser = {
      name: "Json Bearded",
      username: "json",
      email: "jason@foo.org",
    };
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

    mockGithubClient.hasAppInstallation.mockImplementation(
      async (repository) =>
        repository.equals(ownerBcrFork) || repository.equals(releaserBcrFork)
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
    const releaser = {
      name: "Json Bearded",
      username: "json",
      email: "jason@foo.org",
    };
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

    await expectThrownError(
      () => findRegistryForkService.findCandidateForks(rulesetRepo, releaser),
      NoCandidateForksError
    );
  });

  test("complains when no bcr forks are found with the app installed", async () => {
    const owner = "foo-company";
    const releaser = {
      name: "Json Bearded",
      username: "json",
      email: "json@bearded.org",
    };
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

    mockGithubClient.hasAppInstallation.mockReturnValue(Promise.resolve(false));

    await expectThrownError(
      () => findRegistryForkService.findCandidateForks(rulesetRepo, releaser),
      NoCandidateForksError
    );
  });
});
