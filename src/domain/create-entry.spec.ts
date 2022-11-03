import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { mocked, Mocked } from "jest-mock";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { GitClient } from "../infrastructure/git";
import { GitHubClient } from "../infrastructure/github";
import {
  fakeMetadataFile,
  fakeModuleFile,
  fakePresubmitFile,
  fakeSourceFile,
} from "../test/mock-template-files";
import { expectThrownError } from "../test/util";
import {
  CreateEntryService,
  MetadataParseError,
  VersionAlreadyPublishedError,
} from "./create-entry";
import { CANONICAL_BCR } from "./find-registry-fork";
import { ReleaseHashService } from "./release-hash";
import { Repository } from "./repository";
import { RulesetRepository } from "./ruleset-repository";
import { User } from "./user";

let createEntryService: CreateEntryService;
let mockGitClient: Mocked<GitClient>;
let mockGithubClient: Mocked<GitHubClient>;
let mockReleaseHashService: Mocked<ReleaseHashService>;

jest.mock("../infrastructure/git");
jest.mock("../infrastructure/github");
jest.mock("./release-hash");
jest.mock("node:fs");

const mockedFileReads: { [path: string]: string } = {};

beforeEach(() => {
  jest.clearAllMocks();

  mocked(fs.readFileSync).mockImplementation(((
    path: string,
    ...args: any[]
  ) => {
    if (path in mockedFileReads) {
      return mockedFileReads[path];
    }
    return (jest.requireActual("node:fs") as any).readFileSync.apply([
      path,
      ...args,
    ]);
  }) as any);

  mocked(fs.existsSync).mockImplementation(((path: string) => {
    if (path in mockedFileReads) {
      return true;
    }
    return (jest.requireActual("node:fs") as any).existsSync(path);
  }) as any);

  for (let key of Object.keys(mockedFileReads)) {
    delete mockedFileReads[key];
  }

  mockGitClient = mocked(new GitClient());
  mockGithubClient = mocked(new GitHubClient());
  mockReleaseHashService = mocked(new ReleaseHashService());
  mockReleaseHashService.calculate.mockReturnValue(
    Promise.resolve(randomUUID())
  );
  Repository.gitClient = mockGitClient;
  createEntryService = new CreateEntryService(
    mockGitClient,
    mockGithubClient,
    mockReleaseHashService
  );
});

describe("createEntryFiles", () => {
  test("checks out the ruleset repository at the release tag", async () => {
    mockRulesetTemplateFiles();
    const tag = "v1.2.3";
    const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
    const bcrRepo = CANONICAL_BCR;

    await createEntryService.createEntryFiles(rulesetRepo, bcrRepo, tag);

    expect(mockGitClient.checkout).toHaveBeenCalledWith(
      rulesetRepo.diskPath,
      tag
    );
  });

  test("checks out the bcr repo at main", async () => {
    mockRulesetTemplateFiles();

    const tag = "v1.2.3";
    const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
    const bcrRepo = CANONICAL_BCR;

    await createEntryService.createEntryFiles(rulesetRepo, bcrRepo, tag);

    expect(mockGitClient.checkout).toHaveBeenCalledWith(
      bcrRepo.diskPath,
      "main"
    );
  });

  test("creates the required entry files", async () => {
    mockRulesetTemplateFiles();

    const tag = "v1.2.3";
    const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
    const bcrRepo = CANONICAL_BCR;

    await createEntryService.createEntryFiles(rulesetRepo, bcrRepo, tag);

    const metadataFilePath = path.join(
      bcrRepo.diskPath,
      "modules",
      rulesetRepo.moduleName,
      "metadata.json"
    );
    const sourceFilePath = path.join(
      bcrRepo.diskPath,
      "modules",
      rulesetRepo.moduleName,
      "1.2.3",
      "source.json"
    );
    const presubmitFilePath = path.join(
      bcrRepo.diskPath,
      "modules",
      rulesetRepo.moduleName,
      "1.2.3",
      "presubmit.yml"
    );
    const moduleFilePath = path.join(
      bcrRepo.diskPath,
      "modules",
      rulesetRepo.moduleName,
      "1.2.3",
      "MODULE.bazel"
    );

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      metadataFilePath,
      expect.any(String),
      expect.anything()
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      moduleFilePath,
      expect.any(String),
      expect.anything()
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      sourceFilePath,
      expect.any(String),
      expect.anything()
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.any(String),
      presubmitFilePath
    );
  });

  test("throws when an entry for the version already exists", async () => {
    mockRulesetTemplateFiles();

    const tag = "v1.0.0";
    const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
    const bcrRepo = CANONICAL_BCR;

    mockBcrMetadataExists(rulesetRepo, bcrRepo, true);
    mockBcrMetadataFile(rulesetRepo, bcrRepo, { versions: ["1.0.0"] });

    const thrownError = await expectThrownError(
      () => createEntryService.createEntryFiles(rulesetRepo, bcrRepo, tag),
      VersionAlreadyPublishedError
    );
    expect(thrownError!.message.includes("1.0.0")).toEqual(true);
  });

  describe("metadata.json", () => {
    test("creates a new metadata file if one doesn't exist for the ruleset", async () => {
      mockRulesetTemplateFiles();

      const tag = "v1.2.3";
      const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
      const bcrRepo = CANONICAL_BCR;

      mockBcrMetadataExists(rulesetRepo, bcrRepo, false);

      await createEntryService.createEntryFiles(rulesetRepo, bcrRepo, tag);

      const writeMetadataCall = mocked(fs.writeFileSync).mock.calls.find(
        (call) => (call[0] as string).includes("metadata.json")
      );
      const writtenMetadataContent = writeMetadataCall[1] as string;
      expect(JSON.parse(fakeMetadataFile({ versions: ["1.2.3"] }))).toEqual(
        JSON.parse(writtenMetadataContent)
      );
    });

    test("adds versions from existing bcr metadata file if one exists", async () => {
      mockRulesetTemplateFiles();

      const tag = "v1.2.3";
      const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
      const bcrRepo = CANONICAL_BCR;

      mockBcrMetadataExists(rulesetRepo, bcrRepo, true);
      mockBcrMetadataFile(rulesetRepo, bcrRepo, {
        versions: ["1.0.0", "1.1.0"],
      });

      await createEntryService.createEntryFiles(rulesetRepo, bcrRepo, tag);

      const writeMetadataCall = mocked(fs.writeFileSync).mock.calls.find(
        (call) => (call[0] as string).includes("metadata.json")
      );
      const writtenMetadataContent = writeMetadataCall[1] as string;
      expect(
        JSON.parse(fakeMetadataFile({ versions: ["1.0.0", "1.1.0", "1.2.3"] }))
      ).toEqual(JSON.parse(writtenMetadataContent));
    });

    test("updates bcr metadata file if there were changes to the template", async () => {
      mockRulesetTemplateFiles({ metadataHomepage: "foo.bar.com" });

      const tag = "v1.2.3";
      const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
      const bcrRepo = CANONICAL_BCR;

      mockBcrMetadataExists(rulesetRepo, bcrRepo, true);
      mockBcrMetadataFile(rulesetRepo, bcrRepo);

      await createEntryService.createEntryFiles(rulesetRepo, bcrRepo, tag);

      const writeMetadataCall = mocked(fs.writeFileSync).mock.calls.find(
        (call) => (call[0] as string).includes("metadata.json")
      );
      const writtenMetadataContent = writeMetadataCall[1] as string;
      expect(JSON.parse(writtenMetadataContent)).toEqual(
        JSON.parse(
          fakeMetadataFile({ versions: ["1.2.3"], homepage: "foo.bar.com" })
        )
      );
    });

    test("creates a new metadata file when the tag doens't start with a 'v'", async () => {
      mockRulesetTemplateFiles();

      const tag = "1.2.3";
      const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
      const bcrRepo = CANONICAL_BCR;

      mockBcrMetadataExists(rulesetRepo, bcrRepo, false);

      await createEntryService.createEntryFiles(rulesetRepo, bcrRepo, tag);

      const writeMetadataCall = mocked(fs.writeFileSync).mock.calls.find(
        (call) => (call[0] as string).includes("metadata.json")
      );
      const writtenMetadataContent = writeMetadataCall[1] as string;
      expect(JSON.parse(fakeMetadataFile({ versions: ["1.2.3"] }))).toEqual(
        JSON.parse(writtenMetadataContent)
      );
    });

    test("complains when the bcr metadata file cannot be parsed", async () => {
      mockRulesetTemplateFiles();

      const tag = "v1.2.3";
      const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
      const bcrRepo = CANONICAL_BCR;

      mockBcrMetadataExists(rulesetRepo, bcrRepo, true);
      mockBcrMetadataFile(rulesetRepo, bcrRepo, { malformed: true });

      await expectThrownError(
        () => createEntryService.createEntryFiles(rulesetRepo, bcrRepo, tag),
        MetadataParseError
      );
    });
  });

  describe("MODULE.bazel", () => {
    test("stamps new module version", async () => {
      mockRulesetTemplateFiles();

      const tag = "v1.2.3";
      const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
      const bcrRepo = CANONICAL_BCR;

      await createEntryService.createEntryFiles(rulesetRepo, bcrRepo, tag);

      const writeModuleCall = mocked(fs.writeFileSync).mock.calls.find((call) =>
        (call[0] as string).includes("MODULE.bazel")
      );
      const writtenModuleContent = writeModuleCall[1] as string;
      expect(writtenModuleContent).toEqual(
        fakeModuleFile({ version: "1.2.3" })
      );
    });
  });

  describe("presubmit.yml", () => {
    test("copies the presubmit.yml file", async () => {
      mockRulesetTemplateFiles({ moduleName: "foo_ruleset" });

      const tag = "v1.2.3";
      const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
      const bcrRepo = CANONICAL_BCR;

      await createEntryService.createEntryFiles(rulesetRepo, bcrRepo, tag);

      expect(fs.copyFileSync).toHaveBeenCalledWith(
        rulesetRepo.presubmitPath,
        path.join(
          bcrRepo.diskPath,
          "modules",
          "foo_ruleset",
          "1.2.3",
          "presubmit.yml"
        )
      );
    });
  });

  describe("source.json", () => {
    test("stamps an integrity hash", async () => {
      mockRulesetTemplateFiles();

      const tag = "v1.2.3";
      const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
      const bcrRepo = CANONICAL_BCR;

      const hash = randomUUID();
      mockReleaseHashService.calculate.mockReturnValue(Promise.resolve(hash));

      await createEntryService.createEntryFiles(rulesetRepo, bcrRepo, tag);

      const writeSourceCall = mocked(fs.writeFileSync).mock.calls.find((call) =>
        (call[0] as string).includes("source.json")
      );
      const writtenSourceContent = JSON.parse(writeSourceCall[1] as string);
      expect(writtenSourceContent.integrity).toEqual(`sha256-${hash}`);
    });

    test("substitutes values for {REPO}, {OWNER}, {VERSION}, and {TAG}", async () => {
      mockRulesetTemplateFiles({
        sourceUrl:
          "https://github.com/{OWNER}/{REPO}/archive/refs/tags/{TAG}.tar.gz",
        sourceStripPrefix: "{REPO}-{VERSION}",
      });

      const tag = "v1.2.3";
      const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
      const bcrRepo = CANONICAL_BCR;

      await createEntryService.createEntryFiles(rulesetRepo, bcrRepo, tag);

      const writeSourceCall = mocked(fs.writeFileSync).mock.calls.find((call) =>
        (call[0] as string).includes("source.json")
      );
      const writtenSourceContent = JSON.parse(writeSourceCall[1] as string);
      expect(writtenSourceContent.url).toEqual(
        `https://github.com/${rulesetRepo.owner}/${rulesetRepo.name}/archive/refs/tags/${tag}.tar.gz`
      );
      expect(writtenSourceContent.strip_prefix).toEqual(
        `${rulesetRepo.name}-1.2.3`
      );
    });

    test("saves with a trailing newline", async () => {
      mockRulesetTemplateFiles();

      const tag = "v1.2.3";
      const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
      const bcrRepo = CANONICAL_BCR;

      const hash = randomUUID();
      mockReleaseHashService.calculate.mockReturnValue(Promise.resolve(hash));

      await createEntryService.createEntryFiles(rulesetRepo, bcrRepo, tag);

      const writeSourceCall = mocked(fs.writeFileSync).mock.calls.find((call) =>
        (call[0] as string).includes("source.json")
      );
      const writtenSourceContent = writeSourceCall[1] as string;
      expect(writtenSourceContent.endsWith("\n")).toEqual(true);
    });
  });
});

describe("commitEntryToNewBranch", () => {
  test("sets the commit author to the releaser", async () => {
    mockRulesetTemplateFiles();

    const tag = "v1.2.3";
    const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
    const bcrRepo = CANONICAL_BCR;
    const releaser: User = {
      name: "Json Bearded",
      email: "json@bearded.ca",
      username: "json",
    };

    await createEntryService.commitEntryToNewBranch(
      rulesetRepo,
      bcrRepo,
      tag,
      releaser
    );

    expect(mockGitClient.setUserNameAndEmail).toHaveBeenCalledWith(
      bcrRepo.diskPath,
      releaser.name,
      releaser.email
    );
  });

  test("checks out a new branch on the bcr repo", async () => {
    mockRulesetTemplateFiles();

    const tag = "v1.2.3";
    const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
    const bcrRepo = CANONICAL_BCR;
    const releaser: User = {
      name: "Json Bearded",
      email: "json@bearded.ca",
      username: "json",
    };

    await createEntryService.commitEntryToNewBranch(
      rulesetRepo,
      bcrRepo,
      tag,
      releaser
    );

    expect(mockGitClient.checkoutNewBranchFromHead).toHaveBeenCalledWith(
      bcrRepo.diskPath,
      expect.any(String)
    );
  });

  test("branch contains the repo name and release tag", async () => {
    mockRulesetTemplateFiles();

    const tag = "v1.2.3";
    const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
    const bcrRepo = CANONICAL_BCR;
    const releaser: User = {
      name: "Json Bearded",
      email: "json@bearded.ca",
      username: "json",
    };

    await createEntryService.commitEntryToNewBranch(
      rulesetRepo,
      bcrRepo,
      tag,
      releaser
    );

    expect(mockGitClient.checkoutNewBranchFromHead).toHaveBeenCalledTimes(1);
    expect(mockGitClient.checkoutNewBranchFromHead).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(rulesetRepo.canonicalName)
    );
    expect(mockGitClient.checkoutNewBranchFromHead).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(tag)
    );
  });

  test("returns the created branch name", async () => {
    mockRulesetTemplateFiles();

    const tag = "v1.2.3";
    const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
    const bcrRepo = CANONICAL_BCR;
    const releaser: User = {
      name: "Json Bearded",
      email: "json@bearded.ca",
      username: "json",
    };

    const returnedBranch = await createEntryService.commitEntryToNewBranch(
      rulesetRepo,
      bcrRepo,
      tag,
      releaser
    );
    const createdBranch =
      mockGitClient.checkoutNewBranchFromHead.mock.calls[0][1];

    expect(returnedBranch).toEqual(createdBranch);
  });

  test("commit message contains the repo name and release tag", async () => {
    mockRulesetTemplateFiles();

    const tag = "v1.2.3";
    const rulesetRepo = await RulesetRepository.create("repo", "owner", tag);
    const bcrRepo = CANONICAL_BCR;
    const releaser: User = {
      name: "Json Bearded",
      email: "json@bearded.ca",
      username: "json",
    };

    await createEntryService.commitEntryToNewBranch(
      rulesetRepo,
      bcrRepo,
      tag,
      releaser
    );

    expect(mockGitClient.commitChanges).toHaveBeenCalledTimes(1);
    expect(mockGitClient.commitChanges).toHaveBeenCalledWith(
      bcrRepo.diskPath,
      expect.stringContaining(rulesetRepo.canonicalName)
    );
    expect(mockGitClient.commitChanges).toHaveBeenCalledWith(
      bcrRepo.diskPath,
      expect.stringContaining(tag)
    );
  });
});

describe("pushEntryToFork", () => {
  test("acquires an authenticated remote url for the bcr fork", async () => {
    const bcrRepo = CANONICAL_BCR;
    const bcrForkRepo = new Repository("bazel-central-registry", "aspect");
    const branchName = `repo/owner@v1.2.3`;

    await createEntryService.pushEntryToFork(bcrForkRepo, bcrRepo, branchName);
    expect(mockGithubClient.getAuthenticatedRemoteUrl).toHaveBeenCalledWith(
      bcrForkRepo
    );
  });

  test("adds a remote with the authenticated url for the fork to the local bcr repo", async () => {
    const bcrRepo = CANONICAL_BCR;
    const bcrForkRepo = new Repository("bazel-central-registry", "aspect");
    const branchName = `repo/owner@v1.2.3`;
    const authenticatedUrl = randomUUID();

    mockGithubClient.getAuthenticatedRemoteUrl.mockReturnValueOnce(
      Promise.resolve(authenticatedUrl)
    );

    await createEntryService.pushEntryToFork(bcrForkRepo, bcrRepo, branchName);
    expect(mockGitClient.addRemote).toHaveBeenCalledWith(
      bcrRepo.diskPath,
      expect.any(String),
      authenticatedUrl
    );
  });

  test("named the authenticated remote 'authed-fork'", async () => {
    const bcrRepo = CANONICAL_BCR;
    const bcrForkRepo = new Repository("bazel-central-registry", "aspect");
    const branchName = `repo/owner@v1.2.3`;
    const authenticatedUrl = randomUUID();

    mockGithubClient.getAuthenticatedRemoteUrl.mockReturnValueOnce(
      Promise.resolve(authenticatedUrl)
    );

    await createEntryService.pushEntryToFork(bcrForkRepo, bcrRepo, branchName);
    expect(mockGitClient.addRemote).toHaveBeenCalledWith(
      expect.any(String),
      "authed-fork",
      expect.any(String)
    );
  });

  test("pushes the entry branch to the fork using the authorized remote", async () => {
    const bcrRepo = CANONICAL_BCR;
    const bcrForkRepo = new Repository("bazel-central-registry", "aspect");
    const branchName = `repo/owner@v1.2.3`;

    await createEntryService.pushEntryToFork(bcrForkRepo, bcrRepo, branchName);

    expect(mockGitClient.push).toHaveBeenCalledWith(
      bcrRepo.diskPath,
      "authed-fork",
      branchName
    );
  });
});

function mockRulesetTemplateFiles(
  options: {
    moduleName?: string;
    metadataHomepage?: string;
    metadataVersions?: string[];
    sourceUrl?: string;
    sourceStripPrefix?: string;
  } = {}
) {
  mockGitClient.checkout.mockImplementation(
    async (repoPath: string, ref?: string) => {
      mockedFileReads[path.join(repoPath, "MODULE.bazel")] = fakeModuleFile({
        moduleName: options.moduleName,
      });
      mockedFileReads[
        path.join(
          repoPath,
          RulesetRepository.BCR_TEMPLATE_DIR,
          "source.template.json"
        )
      ] = fakeSourceFile({
        url: options.sourceUrl,
        stripPrefix: options.sourceStripPrefix,
      });
      mockedFileReads[
        path.join(repoPath, RulesetRepository.BCR_TEMPLATE_DIR, "presubmit.yml")
      ] = fakePresubmitFile();
      mockedFileReads[
        path.join(
          repoPath,
          RulesetRepository.BCR_TEMPLATE_DIR,
          "metadata.template.json"
        )
      ] = fakeMetadataFile({
        versions: options.metadataVersions,
        homepage: options.metadataHomepage,
      });
    }
  );
}

function mockBcrMetadataExists(
  rulesetRepo: RulesetRepository,
  bcrRepo: Repository,
  exists: boolean
) {
  mocked(fs.existsSync).mockImplementation(((p: string) => {
    if (
      p ==
      path.join(
        bcrRepo.diskPath,
        "modules",
        rulesetRepo.moduleName,
        "metadata.json"
      )
    ) {
      return exists;
    }
    return (jest.requireActual("node:fs") as any).existsSync(path);
  }) as any);
}

function mockBcrMetadataFile(
  rulesetRepo: RulesetRepository,
  bcrRepo: Repository,
  options?: { versions?: string[]; homepage?: string; malformed?: boolean }
) {
  mockedFileReads[
    path.join(
      bcrRepo.diskPath,
      "modules",
      rulesetRepo.moduleName,
      "metadata.json"
    )
  ] = fakeMetadataFile(options);
}
