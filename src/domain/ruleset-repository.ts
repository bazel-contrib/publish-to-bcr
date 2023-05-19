import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { Configuration } from "./config.js";
import { UserFacingError } from "./error.js";
import { ModuleFile } from "./module-file.js";
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
  constructor(
    repository: RulesetRepository,
    moduleRoot: string,
    reason: string
  ) {
    super(
      repository,
      `Invalid metadata template file ${path.join(
        RulesetRepository.BCR_TEMPLATE_DIR,
        moduleRoot,
        "metadata.template.json"
      )}:: ${reason}`
    );
  }
}

export class InvalidPresubmitFileError extends RulesetRepoError {
  constructor(
    repository: RulesetRepository,
    moduleRoot: string,
    reason: string
  ) {
    super(
      repository,
      `Invalid presubmit file ${path.join(
        RulesetRepository.BCR_TEMPLATE_DIR,
        moduleRoot,
        "presubmit.yml"
      )}: ${reason}`
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

  private _sourceTemplate: Record<string, SourceTemplate> = {};
  private _config: Configuration;

  public static async create(
    name: string,
    owner: string,
    verifyAtRef?: string
  ): Promise<RulesetRepository> {
    const rulesetRepo = new RulesetRepository(name, owner);
    await rulesetRepo.checkout(verifyAtRef);

    rulesetRepo._config = loadConfiguration(rulesetRepo);

    const requiredFiles = [];
    for (let root of rulesetRepo._config.moduleRoots) {
      requiredFiles.push(
        ...[
          path.join(
            RulesetRepository.BCR_TEMPLATE_DIR,
            root,
            "metadata.template.json"
          ),
          path.join(RulesetRepository.BCR_TEMPLATE_DIR, root, "presubmit.yml"),
          path.join(
            RulesetRepository.BCR_TEMPLATE_DIR,
            root,
            "source.template.json"
          ),
        ]
      );
    }

    const missingFiles = [];
    for (let file of requiredFiles) {
      if (!fs.existsSync(path.join(rulesetRepo.diskPath, file))) {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length) {
      throw new MissingFilesError(rulesetRepo, missingFiles);
    }

    for (let moduleRoot of rulesetRepo._config.moduleRoots) {
      validateMetadataTemplate(rulesetRepo, moduleRoot);

      try {
        rulesetRepo._sourceTemplate[moduleRoot] = new SourceTemplate(
          rulesetRepo.sourceTemplatePath(moduleRoot)
        );
      } catch (e) {
        if (e instanceof _InvalidSourceTemplateError) {
          throw new InvalidSourceTemplateError(rulesetRepo, e.message);
        }
        throw e;
      }

      validatePresubmitFile(rulesetRepo, moduleRoot);
    }

    return rulesetRepo;
  }

  public static getVersionFromTag(tag: string): string {
    if (tag.startsWith("v")) {
      return tag.substring(1);
    }
    return tag;
  }

  private constructor(readonly name: string, readonly owner: string) {
    super(name, owner);
  }

  public metadataTemplatePath(moduleRoot: string): string {
    return path.resolve(
      this.diskPath,
      RulesetRepository.BCR_TEMPLATE_DIR,
      moduleRoot,
      "metadata.template.json"
    );
  }

  public presubmitPath(moduleRoot: string): string {
    return path.resolve(
      this.diskPath,
      RulesetRepository.BCR_TEMPLATE_DIR,
      moduleRoot,
      "presubmit.yml"
    );
  }

  public sourceTemplatePath(moduleRoot: string): string {
    return path.resolve(
      this.diskPath,
      RulesetRepository.BCR_TEMPLATE_DIR,
      moduleRoot,
      "source.template.json"
    );
  }

  public sourceTemplate(moduleRoot: string): SourceTemplate {
    return this._sourceTemplate[moduleRoot];
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

  public getModuleName(moduleRoot: string): string {
    return new ModuleFile(path.join(this.diskPath, moduleRoot, "MODULE.bazel"))
      .moduleName;
  }
}

function validateMetadataTemplate(
  rulesetRepo: RulesetRepository,
  moduleRoot: string
) {
  let metadata: Record<string, unknown>;

  try {
    metadata = JSON.parse(
      fs.readFileSync(rulesetRepo.metadataTemplatePath(moduleRoot), "utf-8")
    );
  } catch (error) {
    throw new InvalidMetadataTemplateError(
      rulesetRepo,
      moduleRoot,
      "cannot parse file as json"
    );
  }

  if (!metadata.versions) {
    throw new InvalidMetadataTemplateError(
      rulesetRepo,
      moduleRoot,
      "missing versions field"
    );
  }

  if (!Array.isArray(metadata.versions)) {
    throw new InvalidMetadataTemplateError(
      rulesetRepo,
      moduleRoot,
      "invalid versions field"
    );
  }
}

function validatePresubmitFile(
  rulesetRepo: RulesetRepository,
  moduleRoot: string
) {
  try {
    yaml.parse(fs.readFileSync(rulesetRepo.presubmitPath(moduleRoot), "utf-8"));
  } catch (error) {
    throw new InvalidPresubmitFileError(
      rulesetRepo,
      moduleRoot,
      "cannot parse file as yaml"
    );
  }
}

function loadConfiguration(rulesetRepo: RulesetRepository): Configuration {
  const DEFAULT_MODULE_ROOTS = ["."];

  if (!fs.existsSync(rulesetRepo.configFilePath)) {
    return { moduleRoots: DEFAULT_MODULE_ROOTS };
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

  if (
    config.moduleRoots !== undefined &&
    (!Array.isArray(config.moduleRoots) ||
      !config.moduleRoots.every((value) => typeof value === "string"))
  ) {
    throw new InvalidConfigFileError(
      rulesetRepo,
      "could not parse 'moduleRoots'"
    );
  }

  return {
    fixedReleaser: config.fixedReleaser,
    moduleRoots: config.moduleRoots || DEFAULT_MODULE_ROOTS,
  } as Configuration;
}
