import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { Configuration } from "./config.js";
import { UserFacingError } from "./error.js";
import { Repository } from "./repository.js";

export class MissingFilesError extends UserFacingError {
  constructor(
    repository: RulesetRepository,
    public readonly missingFiles: string[]
  ) {
    super(
      `\
Could not locate the following required files in ${repository.canonicalName}:
${missingFiles.map((missingFile) => `  ${missingFile}`).join("\n")}
Did you forget to add them to your ruleset repository? See instructions here: https://github.com/bazel-contrib/publish-to-bcr/blob/main/templates`
    );
  }
}

export class InvalidModuleFileError extends UserFacingError {
  constructor(repository: RulesetRepository) {
    super(
      `Unable to parse the MODULE.bazel file in ${repository.canonicalName}. Please double check that it is correct.`
    );
  }
}

export class InvalidMetadataTemplateError extends UserFacingError {
  constructor(repository: RulesetRepository, reason: string) {
    super(
      `Invalid metadata.template.json file in ${repository.canonicalName}: ${reason}`
    );
  }
}

export class InvalidSourceTemplateError extends UserFacingError {
  constructor(repository: RulesetRepository, reason: string) {
    super(
      `Invalid source.template.json file in ${repository.canonicalName}: ${reason}`
    );
  }
}

export class InvalidPresubmitFileError extends UserFacingError {
  constructor(repository: RulesetRepository, reason: string) {
    super(
      `Invalid presubmit.yml file in ${repository.canonicalName}: ${reason}`
    );
  }
}

export class InvalidConfigFileError extends UserFacingError {
  constructor(repository: RulesetRepository, reason: string) {
    super(`Invalid config.yml file in ${repository.canonicalName}: ${reason}`);
  }
}

export class RulesetRepository extends Repository {
  public static readonly BCR_TEMPLATE_DIR = ".bcr";

  private _moduleName: string;
  private _config: Configuration;

  public static async create(
    name: string,
    owner: string,
    verifyAtRef?: string
  ): Promise<RulesetRepository> {
    const rulesetRepo = new RulesetRepository(name, owner);
    await rulesetRepo.checkout(verifyAtRef);

    const requiredFiles = [
      path.join("MODULE.bazel"),
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

    rulesetRepo._moduleName = rulesetRepo.parseModuleName();
    validateMetadataTemplate(rulesetRepo);
    validateSourceTemplate(rulesetRepo);
    validatePrecommitFile(rulesetRepo);

    rulesetRepo._config = loadConfiguration(rulesetRepo);

    return rulesetRepo;
  }

  private constructor(readonly name: string, readonly owner: string) {
    super(name, owner);
  }

  private parseModuleName() {
    const moduleContent = fs.readFileSync(this.moduleFilePath, {
      encoding: "utf-8",
    });

    const regex = /module\([^)]*?name\s*=\s*"(\w+)"/s;
    const match = moduleContent.match(regex);
    if (match) {
      return match[1];
    }
    throw new InvalidModuleFileError(this);
  }

  public get moduleName(): string {
    return this._moduleName;
  }

  public get moduleFilePath(): string {
    return path.resolve(this.diskPath, "MODULE.bazel");
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

  public get configFilePath(): string {
    return path.resolve(
      this.diskPath,
      RulesetRepository.BCR_TEMPLATE_DIR,
      "config.yml"
    );
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

function validateSourceTemplate(rulesetRepo: RulesetRepository) {
  let source: Record<string, unknown>;
  try {
    source = JSON.parse(
      fs.readFileSync(rulesetRepo.sourceTemplatePath, "utf-8")
    );
  } catch (error) {
    throw new InvalidSourceTemplateError(
      rulesetRepo,
      "cannot parse file as json"
    );
  }

  if (!("strip_prefix" in source)) {
    throw new InvalidSourceTemplateError(
      rulesetRepo,
      "missing strip_prefix field"
    );
  }

  if (typeof source.strip_prefix !== "string") {
    throw new InvalidSourceTemplateError(
      rulesetRepo,
      "invalid strip_prefix field"
    );
  }

  if (!source.url) {
    throw new InvalidSourceTemplateError(rulesetRepo, "missing url field");
  }

  if (typeof source.url !== "string") {
    throw new InvalidSourceTemplateError(rulesetRepo, "invalid url field");
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
    config = yaml.parse(fs.readFileSync(rulesetRepo.configFilePath, "utf-8"));
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
