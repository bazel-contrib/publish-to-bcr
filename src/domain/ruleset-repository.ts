import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { Configuration } from "./config.js";
import { UserFacingError } from "./error.js";
import { Repository } from "./repository.js";
import {
  InvalidSourceTemplateError as _InvalidSourceTemplateError,
  SourceTemplate,
} from "./source-template.js";

export class RulesetRepoError extends UserFacingError {
  constructor(public repository: RulesetRepository, reason: string) {
    super(reason);
  }
}

export class MissingFilesError extends RulesetRepoError {
  constructor(
    repository: RulesetRepository,
    public readonly missingFiles: string[]
  ) {
    super(
      repository,
      `\
Could not locate the following required files in ${repository.canonicalName}:
${missingFiles.map((missingFile) => `  ${missingFile}`).join("\n")}
Did you forget to add them to your ruleset repository? See instructions here: https://github.com/bazel-contrib/publish-to-bcr/blob/main/templates`
    );
  }
}

export class InvalidMetadataTemplateError extends RulesetRepoError {
  constructor(repository: RulesetRepository, reason: string) {
    super(
      repository,
      `Invalid metadata.template.json file in ${repository.canonicalName}: ${reason}`
    );
  }
}

export class InvalidPresubmitFileError extends RulesetRepoError {
  constructor(repository: RulesetRepository, reason: string) {
    super(
      repository,
      `Invalid presubmit.yml file in ${repository.canonicalName}: ${reason}`
    );
  }
}

export class InvalidConfigFileError extends RulesetRepoError {
  constructor(repository: RulesetRepository, reason: string) {
    super(
      repository,
      `Invalid config.yml file in ${repository.canonicalName}: ${reason}`
    );
  }
}

export class InvalidSourceTemplateError extends RulesetRepoError {
  constructor(repository: RulesetRepository, reason: string) {
    super(
      repository,
      `Invalid source.template.json file in ${repository.canonicalName}: ${reason}`
    );
  }
}

export class RulesetRepository extends Repository {
  public static readonly BCR_TEMPLATE_DIR = ".bcr";

  private _sourceTemplate: SourceTemplate;
  private _config: Configuration;

  public static async create(
    name: string,
    owner: string,
    verifyAtRef?: string
  ): Promise<RulesetRepository> {
    const rulesetRepo = new RulesetRepository(name, owner);
    await rulesetRepo.checkout(verifyAtRef);

    rulesetRepo._config = loadConfiguration(rulesetRepo);

    const requiredFiles = [
      path.join(RulesetRepository.BCR_TEMPLATE_DIR, "metadata.template.json"),
      path.join(RulesetRepository.BCR_TEMPLATE_DIR, "presubmit.yml"),
      path.join(RulesetRepository.BCR_TEMPLATE_DIR, "source.template.json"),
    ];

    const missingFiles = [];
    for (let file of requiredFiles) {
      if (!fs.existsSync(path.join(rulesetRepo.diskPath, file))) {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length) {
      throw new MissingFilesError(rulesetRepo, missingFiles);
    }

    validateMetadataTemplate(rulesetRepo);

    try {
      rulesetRepo._sourceTemplate = new SourceTemplate(
        rulesetRepo.sourceTemplatePath
      );
    } catch (e) {
      if (e instanceof _InvalidSourceTemplateError) {
        throw new InvalidSourceTemplateError(rulesetRepo, e.message);
      }
      throw e;
    }

    validatePrecommitFile(rulesetRepo);

    return rulesetRepo;
  }

  private constructor(readonly name: string, readonly owner: string) {
    super(name, owner);
  }

  public get metadataTemplatePath(): string {
    return path.resolve(
      this.diskPath,
      RulesetRepository.BCR_TEMPLATE_DIR,
      "metadata.template.json"
    );
  }

  public get presubmitPath(): string {
    return path.resolve(
      this.diskPath,
      RulesetRepository.BCR_TEMPLATE_DIR,
      "presubmit.yml"
    );
  }

  public get sourceTemplatePath(): string {
    return path.resolve(
      this.diskPath,
      RulesetRepository.BCR_TEMPLATE_DIR,
      "source.template.json"
    );
  }

  public get sourceTemplate(): SourceTemplate {
    return this._sourceTemplate;
  }

  public get configFilePath(): string {
    let configPath = path.resolve(
      this.diskPath,
      RulesetRepository.BCR_TEMPLATE_DIR,
      "config.yaml"
    );

    if (!fs.existsSync(configPath)) {
      configPath = path.resolve(
        this.diskPath,
        RulesetRepository.BCR_TEMPLATE_DIR,
        "config.yml"
      );
    }

    return configPath;
  }

  public get config(): Configuration {
    return this._config;
  }
}

function validateMetadataTemplate(rulesetRepo: RulesetRepository) {
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(
      fs.readFileSync(rulesetRepo.metadataTemplatePath, "utf-8")
    );
  } catch (error) {
    throw new InvalidMetadataTemplateError(
      rulesetRepo,
      "cannot parse file as json"
    );
  }

  if (!metadata.versions) {
    throw new InvalidMetadataTemplateError(
      rulesetRepo,
      "missing versions field"
    );
  }

  if (!Array.isArray(metadata.versions)) {
    throw new InvalidMetadataTemplateError(
      rulesetRepo,
      "invalid versions field"
    );
  }
}

function validatePrecommitFile(rulesetRepo: RulesetRepository) {
  try {
    yaml.parse(fs.readFileSync(rulesetRepo.presubmitPath, "utf-8"));
  } catch (error) {
    throw new InvalidPresubmitFileError(
      rulesetRepo,
      "cannot parse file as yaml"
    );
  }
}

function loadConfiguration(rulesetRepo: RulesetRepository): Configuration {
  if (!fs.existsSync(rulesetRepo.configFilePath)) {
    return {};
  }

  let config: Record<string, any>;
  try {
    config =
      yaml.parse(fs.readFileSync(rulesetRepo.configFilePath, "utf-8")) || {};
  } catch (error) {
    throw new InvalidConfigFileError(rulesetRepo, "cannot parse file as yaml");
  }

  if (
    config.fixedReleaser &&
    (typeof config.fixedReleaser !== "object" ||
      typeof config.fixedReleaser.login !== "string" ||
      typeof config.fixedReleaser.email !== "string")
  ) {
    throw new InvalidConfigFileError(
      rulesetRepo,
      "could not parse 'fixedReleaser'"
    );
  }

  return { fixedReleaser: config.fixedReleaser } as Configuration;
}
