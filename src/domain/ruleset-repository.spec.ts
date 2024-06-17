import { mocked } from "jest-mock";
import fs from "node:fs";
import path from "node:path";
import { GitClient } from "../infrastructure/git";
import {
  fakeConfigFile,
  fakeMetadataFile,
  fakePresubmitFile,
  fakeSourceFile,
} from "../test/mock-template-files";
import { expectThrownError } from "../test/util";
import { FixedReleaser } from "./config";
import {
  InvalidConfigFileError,
  InvalidMetadataTemplateError,
  InvalidPresubmitFileError,
  InvalidSourceTemplateError,
  MissingFilesError,
  RulesetRepoError,
  RulesetRepository,
} from "./ruleset-repository";

jest.mock("node:fs");
jest.mock("../infrastructure/git");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("create", () => {
  test("creates repository when requried files exist", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");
    expect(rulesetRepo.canonicalName).toEqual("bar/foo");
  });

  test("complains about missing required files", async () => {
    mockRulesetFiles({ skipPresubmitFile: true, skipSourceFile: true });

    const thrownError = await expectThrownError(
      () => RulesetRepository.create("foo", "bar", "main"),
      MissingFilesError
    );

    expect((thrownError as MissingFilesError).missingFiles.length).toEqual(2);
    expect((thrownError as MissingFilesError).missingFiles).toContain(
      path.join(RulesetRepository.BCR_TEMPLATE_DIR, "presubmit.yml")
    );
    expect((thrownError as MissingFilesError).missingFiles).toContain(
      path.join(RulesetRepository.BCR_TEMPLATE_DIR, "source.template.json")
    );
  });

  test("complains about missing required files in a different module root", async () => {
    mockRulesetFiles({
      configContent: 'moduleRoots: [".", "sub/dir"]',
      fileExistsMocks: {
        [path.join(
          RulesetRepository.BCR_TEMPLATE_DIR,
          "sub",
          "dir",
          "presumbit.yml"
        )]: false,
        [path.join(
          RulesetRepository.BCR_TEMPLATE_DIR,
          "sub",
          "dir",
          "source.template.json"
        )]: false,
        [path.join(
          RulesetRepository.BCR_TEMPLATE_DIR,
          "sub",
          "dir",
          "metadata.template.json"
        )]: true,
      },
      fileContentMocks: {
        [path.join(
          RulesetRepository.BCR_TEMPLATE_DIR,
          "sub",
          "dir",
          "metadata.template.json"
        )]: fakeMetadataFile(),
      },
    });

    const thrownError = await expectThrownError(
      () => RulesetRepository.create("foo", "bar", "main"),
      MissingFilesError
    );

    expect((thrownError as MissingFilesError).missingFiles.length).toEqual(2);
    expect((thrownError as MissingFilesError).missingFiles).toContain(
      path.join(
        RulesetRepository.BCR_TEMPLATE_DIR,
        "sub",
        "dir",
        "presubmit.yml"
      )
    );
    expect((thrownError as MissingFilesError).missingFiles).toContain(
      path.join(
        RulesetRepository.BCR_TEMPLATE_DIR,
        "sub",
        "dir",
        "source.template.json"
      )
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

  test("complains if the presubmit file cannot be parsed", async () => {
    mockRulesetFiles({ invalidPresubmit: true });

    await expectThrownError(
      () => RulesetRepository.create("foo", "bar", "main"),
      InvalidPresubmitFileError
    );
  });

  test("complains if the source template has errors", async () => {
    mockRulesetFiles({ invalidSourceTemplate: true });

    await expectThrownError(
      () => RulesetRepository.create("foo", "bar", "main"),
      InvalidSourceTemplateError
    );
  });

  describe("config", () => {
    test("defaults configuration when the file doesn't exist", async () => {
      mockRulesetFiles({ configExists: false });
      const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");
      expect(rulesetRepo.config.fixedReleaser).toBeUndefined();
    });

    test("loads a fixedReleaser", async () => {
      mockRulesetFiles({
        configExists: true,
        fixedReleaser: { login: "jbedard", email: "json@bearded.ca" },
      });
      const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");
      expect(rulesetRepo.config.fixedReleaser).toEqual({
        login: "jbedard",
        email: "json@bearded.ca",
      });
    });

    test("throws on invalid fixedReleaser", async () => {
      mockRulesetFiles({ configExists: true, invalidFixedReleaser: true });
      await expectThrownError(
        () => RulesetRepository.create("foo", "bar", "main"),
        InvalidConfigFileError
      );
    });

    test("loads moduleRoots", async () => {
      mockRulesetFiles({
        configExists: true,
        configContent: 'moduleRoots: [".", "subdir"]',
      });
    });

    test("defaults moduleRoots to the root dir", async () => {
      mockRulesetFiles({
        configExists: true,
        configContent: "",
      });
    });

    test("throws on invalid moduleRoots value", async () => {
      mockRulesetFiles({
        configExists: true,
        configContent: "moduleRoots: false",
      });
    });

    test("throws module root that doesn't exist in repo", async () => {
      mockRulesetFiles({
        configExists: true,
        configContent: 'moduleRoots: ["does/not/exist"]',
      });
    });

    test("loads config file with alternate extension 'yaml'", async () => {
      mockRulesetFiles({
        configExists: true,
        configExt: "yaml",
        fixedReleaser: { login: "jbedard", email: "json@bearded.ca" },
      });
      const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");
      expect(rulesetRepo.config.fixedReleaser).toEqual({
        login: "jbedard",
        email: "json@bearded.ca",
      });
    });

    test("should be accessible after a non-config related error", async () => {
      mockRulesetFiles({
        configExists: true,
        fixedReleaser: { login: "jbedard", email: "json@bearded.ca" },
        invalidSourceTemplate: true,
      });

      const thrownError = await expectThrownError(
        () => RulesetRepository.create("foo", "bar", "main"),
        RulesetRepoError
      );

      expect(thrownError.repository.config).toBeTruthy();
      expect(thrownError.repository.config.fixedReleaser).toEqual({
        login: "jbedard",
        email: "json@bearded.ca",
      });
    });

    test("does not complain when the config file is empty", async () => {
      mockRulesetFiles({
        configExists: true,
        configContent: "",
      });

      await RulesetRepository.create("foo", "bar", "main");
    });
  });
});

describe("metadataTemplatePath", () => {
  test("gets path to the metadata.template.json file", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.metadataTemplatePath(".")).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "metadata.template.json"
      )
    );
  });

  test("gets path to the metadata.template.json for a different module root", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.metadataTemplatePath("sub/dir")).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "sub",
        "dir",
        "metadata.template.json"
      )
    );
  });
});

describe("presubmitPath", () => {
  test("gets path to the presubmit.yml file", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.presubmitPath(".")).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "presubmit.yml"
      )
    );
  });
  test("gets path to the presubmit.yml file for a different module root", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.presubmitPath("sub/dir")).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "sub",
        "dir",
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

    expect(rulesetRepo.sourceTemplatePath(".")).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "source.template.json"
      )
    );
  });

  test("gets path to the source.template.json file in a different module root", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.sourceTemplatePath("sub/dir")).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "sub",
        "dir",
        "source.template.json"
      )
    );
  });
});

describe("patchesPath", () => {
  test("gets path to the patches folder", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.patchesPath(".")).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "patches"
      )
    );
  });

  test("gets path to the patches in a different module root", async () => {
    mockRulesetFiles();
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.patchesPath("sub/dir")).toEqual(
      path.join(
        rulesetRepo.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "sub",
        "dir",
        "patches"
      )
    );
  });
});

function mockRulesetFiles(
  options: {
    skipMetadataFile?: boolean;
    skipPresubmitFile?: boolean;
    skipSourceFile?: boolean;
    invalidMetadataFile?: boolean;
    metadataMissingVersions?: boolean;
    invalidPresubmit?: boolean;
    configExists?: boolean;
    configExt?: "yml" | "yaml";
    configContent?: string;
    fixedReleaser?: FixedReleaser;
    invalidFixedReleaser?: boolean;
    invalidSourceTemplate?: boolean;
    fileExistsMocks?: Record<string, boolean>;
    fileContentMocks?: Record<string, string>;
  } = {}
) {
  mocked(GitClient).mockImplementation(() => {
    return {
      checkout: jest.fn(),
      clone: jest.fn().mockImplementation(async (url, repoPath) => {
        const templatesDir = path.join(
          repoPath,
          RulesetRepository.BCR_TEMPLATE_DIR
        );

        mocked(fs.existsSync).mockImplementation(((p: string) => {
          if (
            options.fileExistsMocks &&
            path.relative(repoPath, p) in options.fileExistsMocks!
          ) {
            return options.fileExistsMocks[path.relative(repoPath, p)];
          } else if (p === path.join(templatesDir, "metadata.template.json")) {
            return !options.skipMetadataFile;
          } else if (p === path.join(templatesDir, "presubmit.yml")) {
            return !options.skipPresubmitFile;
          } else if (p === path.join(templatesDir, "source.template.json")) {
            return !options.skipSourceFile;
          } else if (
            p ===
            path.join(templatesDir, `config.${options.configExt || "yml"}`)
          ) {
            return options.configExists || options.configContent !== undefined;
          } else if (p === repoPath) {
            return true;
          }
          return (jest.requireActual("node:fs") as any).existsSync(path);
        }) as any);

        mocked(fs.readFileSync).mockImplementation(((
          p: string,
          ...args: any[]
        ) => {
          if (
            options.fileContentMocks &&
            path.relative(repoPath, p) in options.fileContentMocks!
          ) {
            return options.fileContentMocks[path.relative(repoPath, p)];
          } else if (p === path.join(templatesDir, "metadata.template.json")) {
            return fakeMetadataFile({
              malformed: options.invalidMetadataFile,
              missingVersions: options.metadataMissingVersions,
            });
          } else if (p === path.join(templatesDir, "source.template.json")) {
            return fakeSourceFile({ malformed: options.invalidSourceTemplate });
          } else if (p === path.join(templatesDir, "presubmit.yml")) {
            return fakePresubmitFile({ malformed: options.invalidPresubmit });
          } else if (
            p ===
            path.join(templatesDir, `config.${options.configExt || "yml"}`)
          ) {
            return fakeConfigFile({
              content: options.configContent,
              fixedReleaser: options.fixedReleaser,
              invalidFixedReleaser: options.invalidFixedReleaser,
            });
          }
          return (jest.requireActual("node:fs") as any).readFileSync.apply([
            path,
            ...args,
          ]);
        }) as any);
      }),
    } as any;
  });
}
