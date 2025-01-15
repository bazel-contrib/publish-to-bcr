import { mocked, Mocked } from 'jest-mock';
import { expectThrownError } from '../test/util';
import {
  CANONICAL_BCR,
  FindRegistryForkService,
  NoCandidateForksError,
} from './find-registry-fork';
import { Repository, RepositoryService } from './repository';
import { RulesetRepository } from './ruleset-repository';

jest.mock('./repository', () => ({
  Repository: jest.requireActual('./repository').Repository,
  RepositoryService: jest.fn().mockImplementation(() => {
    return {
      getSourceRepository: jest.fn(),
      getForkedRepositoriesByOwner: jest.fn(),
      hasAppInstallation: jest.fn(),
    };
  }),
}));

let findRegistryForkService: FindRegistryForkService;
let mockRepositoryService: Mocked<RepositoryService>;

// Mock RulesetRepostory.create to avoid network call and necessary file checks
const mockRulesetRepoCreate = jest
  .spyOn(RulesetRepository, 'create')
  .mockImplementation((name, owner) => {
    return new (RulesetRepository as any)(name, owner);
  });

beforeEach(() => {
  mocked(RepositoryService).mockClear();
  mockRulesetRepoCreate.mockClear();

  mockRepositoryService = mocked(new RepositoryService({} as any));
  findRegistryForkService = new FindRegistryForkService(mockRepositoryService);
});

describe('findCandidateForks', () => {
  test('finds fork in same account as ruleset repo', async () => {
    const owner = 'foo-company';
    const releaser = {
      name: 'Json Bearded',
      username: 'json',
      email: 'jason@foo.org',
    };
    const rulesetRepo = await RulesetRepository.create(
      'ruleset',
      owner,
      'main'
    );
    const ownerBcrFork = new Repository('bazel-central-registry', owner);

    mockRepositoryService.getForkedRepositoriesByOwner.mockImplementation(
      async (repoOwner) => {
        if (repoOwner === owner) {
          return [new Repository('a', owner), ownerBcrFork];
        }
        return [];
      }
    );

    mockRepositoryService.getSourceRepository.mockImplementation(
      async (repository) => {
        if (
          repository.owner === ownerBcrFork.owner &&
          repository.name === ownerBcrFork.name
        ) {
          return CANONICAL_BCR;
        }
        return repository;
      }
    );

    mockRepositoryService.hasAppInstallation.mockImplementation(
      async (repository) => repository.equals(ownerBcrFork)
    );

    const forks = await findRegistryForkService.findCandidateForks(
      rulesetRepo,
      releaser
    );

    expect(forks.find((fork) => fork.equals(ownerBcrFork))).toBeTruthy();
  });

  test("finds fork in releaser's account", async () => {
    const owner = 'foo-company';
    const releaser = {
      name: 'Json Bearded',
      username: 'json',
      email: 'jason@foo.org',
    };
    const rulesetRepo = await RulesetRepository.create(
      'ruleset',
      owner,
      'main'
    );
    const releaserBcrFork = new Repository(
      'bazel-central-registry',
      releaser.username
    );

    mockRepositoryService.getForkedRepositoriesByOwner.mockImplementation(
      async (repoOwner) => {
        if (repoOwner === releaser.username) {
          return [new Repository('a', releaser.username), releaserBcrFork];
        }
        return [];
      }
    );

    mockRepositoryService.getSourceRepository.mockImplementation(
      async (repository) => {
        if (
          repository.owner === releaserBcrFork.owner &&
          repository.name === releaserBcrFork.name
        ) {
          return CANONICAL_BCR;
        }
        return repository;
      }
    );

    mockRepositoryService.hasAppInstallation.mockImplementation(
      async (repository) => repository.equals(releaserBcrFork)
    );

    const forks = await findRegistryForkService.findCandidateForks(
      rulesetRepo,
      releaser
    );

    expect(forks.find((fork) => fork.equals(releaserBcrFork))).toBeTruthy();
  });

  test("prioritizes fork in ruleset account before releaser's account", async () => {
    const owner = 'foo-company';
    const releaser = {
      name: 'Json Bearded',
      username: 'json',
      email: 'jason@foo.org',
    };
    const rulesetRepo = await RulesetRepository.create(
      'ruleset',
      owner,
      'main'
    );
    const ownerBcrFork = new Repository('bazel-central-registry', owner);
    const releaserBcrFork = new Repository(
      'bazel-central-registry',
      releaser.username
    );

    mockRepositoryService.getForkedRepositoriesByOwner.mockImplementation(
      async (repoOwner) => {
        if (repoOwner === owner) {
          return [new Repository('a', owner), ownerBcrFork];
        } else {
          // repoOwner === releaser
          return [new Repository('b', releaser.username), releaserBcrFork];
        }
      }
    );

    mockRepositoryService.getSourceRepository.mockImplementation(
      async (repository) => {
        if (
          (repository.owner === releaserBcrFork.owner &&
            repository.name === releaserBcrFork.name) ||
          (repository.owner === ownerBcrFork.owner &&
            repository.name === ownerBcrFork.name)
        ) {
          return CANONICAL_BCR;
        }
        return repository;
      }
    );

    mockRepositoryService.hasAppInstallation.mockImplementation(
      async (repository) =>
        (repository.owner === releaserBcrFork.owner &&
          repository.name === releaserBcrFork.name) ||
        (repository.owner === ownerBcrFork.owner &&
          repository.name === ownerBcrFork.name)
    );

    const forks = await findRegistryForkService.findCandidateForks(
      rulesetRepo,
      releaser
    );

    expect(forks.length).toEqual(2);
    expect(forks[0].equals(ownerBcrFork)).toEqual(true);
    expect(forks[1].equals(releaserBcrFork)).toEqual(true);
  });

  test('does not return a fork named bazel-central-registry that is not sourced from the canonical BCR', async () => {
    const owner = 'foo-company';
    const releaser = {
      name: 'Json Bearded',
      username: 'json',
      email: 'jason@foo.org',
    };
    const rulesetRepo = await RulesetRepository.create(
      'ruleset',
      owner,
      'main'
    );
    const ownerBcrFork = new Repository('bazel-central-registry', owner);

    mockRepositoryService.getForkedRepositoriesByOwner.mockImplementation(
      async (repoOwner) => {
        if (repoOwner === owner) {
          return [new Repository('a', owner), ownerBcrFork];
        }
        return [];
      }
    );

    mockRepositoryService.getSourceRepository.mockImplementation(
      async (repository) => {
        if (
          repository.owner === ownerBcrFork.owner &&
          repository.name === ownerBcrFork.name
        ) {
          return new Repository('bazel-central-registry', 'not-google');
        }
        return repository;
      }
    );

    await expectThrownError(
      () => findRegistryForkService.findCandidateForks(rulesetRepo, releaser),
      NoCandidateForksError
    );
  });

  test('complains when no bcr forks are found with the app installed', async () => {
    const owner = 'foo-company';
    const releaser = {
      name: 'Json Bearded',
      username: 'json',
      email: 'json@bearded.org',
    };
    const rulesetRepo = await RulesetRepository.create(
      'ruleset',
      owner,
      'main'
    );
    const releaserBcrFork = new Repository(
      'bazel-central-registry',
      releaser.username
    );

    mockRepositoryService.getForkedRepositoriesByOwner.mockImplementation(
      async (repoOwner) => {
        if (repoOwner === releaser.username) {
          return [new Repository('a', releaser.username), releaserBcrFork];
        }
        return [];
      }
    );

    mockRepositoryService.getSourceRepository.mockImplementation(
      async (repository) => {
        if (
          repository.owner === releaserBcrFork.owner &&
          repository.name === releaserBcrFork.name
        ) {
          return CANONICAL_BCR;
        }
        return repository;
      }
    );

    mockRepositoryService.hasAppInstallation.mockReturnValue(
      Promise.resolve(false)
    );

    await expectThrownError(
      () => findRegistryForkService.findCandidateForks(rulesetRepo, releaser),
      NoCandidateForksError
    );
  });
});
