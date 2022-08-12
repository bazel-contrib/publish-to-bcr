import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import { mocked, Mocked } from "jest-mock";
import { GitClient } from "../infrastructure/git";
import { Repository } from "./repository";
import fs from "node:fs";
import path from "node:path";
import { RulesetRepository } from "./ruleset-repository";

jest.mock("../infrastructure/git");

let gitClient: Mocked<GitClient>;

beforeEach(() => {
  mocked(GitClient, true).mockClear();
  gitClient = mocked(new GitClient());
  Repository.gitClient = gitClient;
});

describe("create", () => {
  test("creates repository when requried files exist", async () => {
    mockAllRequiredFiles(gitClient);
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");
    expect(rulesetRepo.canonicalName).toEqual("bar/foo");
  });

  test("complains about missing required files", async () => {
    gitClient.clone.mockImplementationOnce((url, repoPath) => {
      const bcrTemplatesPath = path.join(
        repoPath,
        RulesetRepository.BCR_TEMPLATE_DIR
      );
      fs.mkdirSync(repoPath, { recursive: true });
      fs.mkdirSync(bcrTemplatesPath);
      fs.writeFileSync(
        path.join(bcrTemplatesPath, "metadata.template.json"),
        ""
      );
      fs.writeFileSync(path.join(bcrTemplatesPath, "presubmit.yml"), "");

      return Promise.resolve();
    });

    let throwError: Error;
    try {
      await RulesetRepository.create("foo", "bar", "main");
    } catch (e) {
      throwError = e;
    }

    expect(throwError).toBeTruthy();
    expect(throwError.message.includes("MODULE.bazel"));
    expect(throwError.message.includes("source.template.json"));
  });
});

describe("moduleFilePath", () => {
  test("gets path to the MODULE.bazel file", async () => {
    mockAllRequiredFiles(gitClient);
    const rulesetRepo = await RulesetRepository.create("foo", "bar", "main");

    expect(rulesetRepo.moduleFilePath).toEqual(
      path.join(rulesetRepo.diskPath, "MODULE.bazel")
    );
  });
});

describe("metadataTemplatePath", () => {
  test("gets path to the metadata.template.json file", async () => {
    mockAllRequiredFiles(gitClient);
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
    mockAllRequiredFiles(gitClient);
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

describe("sourceTemplatePath", () => {
  test("gets path to the source.template.json file", async () => {
    mockAllRequiredFiles(gitClient);
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

function mockAllRequiredFiles(gitClient: Mocked<GitClient>) {
  gitClient.clone.mockImplementationOnce((url, repoPath) => {
    const bcrTemplatesPath = path.join(
      repoPath,
      RulesetRepository.BCR_TEMPLATE_DIR
    );
    fs.mkdirSync(repoPath, { recursive: true });
    fs.mkdirSync(bcrTemplatesPath);
    fs.writeFileSync(path.join(repoPath, "MODULE.bazel"), "");
    fs.writeFileSync(path.join(bcrTemplatesPath, "metadata.template.json"), "");
    fs.writeFileSync(path.join(bcrTemplatesPath, "presubmit.yml"), "");
    fs.writeFileSync(path.join(bcrTemplatesPath, "source.template.json"), "");

    return Promise.resolve();
  });
}
