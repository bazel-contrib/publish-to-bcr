import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import { mocked, Mocked } from "jest-mock";
import { GitClient } from "../infrastructure/git";
import { Repository } from "./repository";
import fs from "node:fs";
import path from "node:path";
import {
  InvalidConfigFileError,
  InvalidMetadataTemplateError,
  InvalidModuleFileError,
  InvalidPresubmitFileError,
  InvalidSourceTemplateError,
  MissingFilesError,
  RulesetRepository,
} from "./ruleset-repository";
import {
  fakeConfigFile,
  fakeMetadataFile,
  fakeModuleFile,
  fakePresubmitFile,
  fakeSourceFile,
} from "../test/mock-template-files";
import { expectThrownError } from "../test/util";

jest.mock("node:fs");
jest.mock("../infrastructure/git");

let gitClient: Mocked<GitClient>;

beforeEach(() => {
  jest.clearAllMocks();
  gitClient = mocked(new GitClient());
  Repository.gitClient = gitClient;
});

describe("create", () => {
  test("creates repository when requried files exist", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");
    expect(rulesetRepo.canonicalName).toEqual("bar/foo");
  });

  test("complains about missing required files", async () => {
    mockRulesetFiles({ skipModuleFile: true, skipSourceFile: true });

    const thrownError = await expectThrownError(
      () => RulesetRepository.create("foo", "bar", "main"),
      MissingFilesError
    );

    expect((thrownError as MissingFilesError).missingFiles.length).toEqual(2);
    expect((thrownError as MissingFilesError).missingFiles).toContain(
      "MODULE.bazel"
    );
    expect((thrownError as MissingFilesError).missingFiles).toContain(
      path.join(RulesetRepository.BCR_TEMPLATE_DIR, "source.template.json")
    );
  });

  test("complains if it cannot parse the module name from the module file", async () => {
    mockRulesetFiles({ invalidModuleContents: true });

    await expectThrownError(
      () => RulesetRepository.create("foo", "bar", "main"),
      InvalidModuleFileError
    );
  });

  test("complains if the metadata template cannot be parsed", async () => {
    mockRulesetFiles({ invalidMetadataFile: true });

    await expectThrownError(
      () => RulesetRepository.create("foo", "bar", "main"),
      InvalidMetadataTemplateError
    );
  });

  test("complains if the metadata template is missing 'versions'", async () => {
    mockRulesetFiles({ metadataMissingVersions: true });

    await expectThrownError(
      () => RulesetRepository.create("foo", "bar", "main"),
      InvalidMetadataTemplateError
    );
  });

  test("complains if the source template is missing cannot be parsed", async () => {
    mockRulesetFiles({ invalidSourceFile: true });

    await expectThrownError(
      () => RulesetRepository.create("foo", "bar", "main"),
      InvalidSourceTemplateError
    );
  });

  test("complains if the source template is missing 'strip_prefix'", async () => {
    mockRulesetFiles({ sourceMissingStripPrefix: true });

    await expectThrownError(
      () => RulesetRepository.create("foo", "bar", "main"),
      InvalidSourceTemplateError
    );
  });

  test("complains if the source template is missing 'url'", async () => {
    mockRulesetFiles({ sourceMissingUrl: true });

    await expectThrownError(
      () => RulesetRepository.create("foo", "bar", "main"),
      InvalidSourceTemplateError
    );
  });

  test("complains if the presubmit file cannot be parsed", async () => {
    mockRulesetFiles({ invalidPresubmit: true });

    await expectThrownError(
      () => RulesetRepository.create("foo", "bar", "main"),
      InvalidPresubmitFileError
    );
  });

  describe("config", () => {
    test("defaults configuration when the file doesn't exist", async () => {
      mockRulesetFiles({ configExists: false });
      const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");
      expect(rulesetRepo.config.fixedReleaser).toBeUndefined();
    });

    test("loads a fixedReleaser", async () => {
      mockRulesetFiles({ configExists: true, fixedReleaser: "jbedard" });
      const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");
      expect(rulesetRepo.config.fixedReleaser).toEqual("jbedard");
    });

    test("throws on invalid fixedReleaser", async () => {
      mockRulesetFiles({ configExists: true, invalidFixedReleaser: true });
      await expectThrownError(
        () => RulesetRepository.create("foo", "bar", "main"),
        InvalidConfigFileError
      );
    });
  });
});

describe("moduleFilePath", () => {
  test("gets path to the MODULE.bazel file", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.moduleFilePath).toEqual(
      path.join(rulesetRepo.diskPath, "MODULE.bazel")
    );
  });
});

describe("metadataTemplatePath", () => {
  test("gets path to the metadata.template.json file", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.metadataTemplatePath).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "metadata.template.json"
      )
    );
  });
});

describe("presubmitPath", () => {
  test("gets path to the presubmit.yml file", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.presubmitPath).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "presubmit.yml"
      )
    );
  });
});

describe("configFilePath", () => {
  test("gets path to the config.yml file", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.configFilePath).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "config.yml"
      )
    );
  });
});

describe("sourceTemplatePath", () => {
  test("gets path to the source.template.json file", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.sourceTemplatePath).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "source.template.json"
      )
    );
  });
});

describe("moduleName", () => {
  test("returns the correct module name", async () => {
    mockRulesetFiles({ moduleName: "rules_foo" });
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.moduleName).toEqual("rules_foo");
  });

  test("throws when the module name is missing", async () => {
    mockRulesetFiles({ missingModuleName: true });

    await expectThrownError(
      () => RulesetRepository.create("foo", "bar", "main"),
      InvalidModuleFileError
    );
  });

  test("throws when there is no module name and does not mistakenly parse the name attribute from a dep", async () => {
    mockRulesetFiles({ missingModuleName: true, moduleFileDeps: true });

    await expectThrownError(
      () => RulesetRepository.create("foo", "bar", "main"),
      InvalidModuleFileError
    );
  });
});

function mockRulesetFiles(
  options: {
    moduleName?: string;
    missingModuleName?: boolean;
    moduleFileDeps?: boolean;
    skipModuleFile?: boolean;
    skipMetadataFile?: boolean;
    skipPresubmitFile?: boolean;
    skipSourceFile?: boolean;
    invalidModuleContents?: boolean;
    invalidMetadataFile?: boolean;
    metadataMissingVersions?: boolean;
    invalidSourceFile?: boolean;
    sourceMissingStripPrefix?: boolean;
    sourceMissingUrl?: boolean;
    invalidPresubmit?: boolean;
    configExists?: boolean;
    fixedReleaser?: string;
    invalidFixedReleaser?: boolean;
  } = {}
) {
  gitClient.clone.mockImplementationOnce(async (url, repoPath) => {
    mocked(fs.existsSync).mockImplementation(((p: string) => {
      if (p === path.join(repoPath, "MODULE.bazel")) {
        return !options.skipModuleFile;
      } else if (
        p ===
        path.join(
          repoPath,
          RulesetRepository.BCR_TEMPLATE_DIR,
          "metadata.template.json"
        )
      ) {
        return !options.skipMetadataFile;
      } else if (
        p ===
        path.join(repoPath, RulesetRepository.BCR_TEMPLATE_DIR, "presubmit.yml")
      ) {
        return !options.skipPresubmitFile;
      } else if (
        p ===
        path.join(
          repoPath,
          RulesetRepository.BCR_TEMPLATE_DIR,
          "source.template.json"
        )
      ) {
        return !options.skipSourceFile;
      } else if (
        p ===
        path.join(repoPath, RulesetRepository.BCR_TEMPLATE_DIR, "config.yml")
      ) {
        return options.configExists;
      }
      return (jest.requireActual("node:fs") as any).existsSync(path);
    }) as any);

    mocked(fs.readFileSync).mockImplementation(((p: string, ...args: any[]) => {
      if (
        !options.skipModuleFile &&
        p === path.join(repoPath, "MODULE.bazel")
      ) {
        return fakeModuleFile({
          moduleName: options.moduleName,
          missingName: options.missingModuleName,
          invalidContents: options.invalidModuleContents,
          deps: options.moduleFileDeps,
        });
      } else if (
        p ===
        path.join(
          repoPath,
          RulesetRepository.BCR_TEMPLATE_DIR,
          "metadata.template.json"
        )
      ) {
        return fakeMetadataFile({
          malformed: options.invalidMetadataFile,
          missingVersions: options.metadataMissingVersions,
        });
      } else if (
        p ===
        path.join(
          repoPath,
          RulesetRepository.BCR_TEMPLATE_DIR,
          "source.template.json"
        )
      ) {
        return fakeSourceFile({
          malformed: options.invalidSourceFile,
          missingStripPrefix: options.sourceMissingStripPrefix,
          missingUrl: options.sourceMissingUrl,
        });
      } else if (
        p ===
        path.join(repoPath, RulesetRepository.BCR_TEMPLATE_DIR, "presubmit.yml")
      ) {
        return fakePresubmitFile({ malformed: options.invalidPresubmit });
      } else if (
        p ===
        path.join(repoPath, RulesetRepository.BCR_TEMPLATE_DIR, "config.yml")
      ) {
        return fakeConfigFile({
          fixedReleaser: options.fixedReleaser,
          invalidFixedReleaser: options.invalidFixedReleaser,
        });
      }
      return (jest.requireActual("node:fs") as any).readFileSync.apply([
        path,
        ...args,
      ]);
    }) as any);
  });
}
