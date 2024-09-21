import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { Configuration } from "./config.js";
import { UserFacingError } from "./error.js";
import {
  Maintainer,
  MetadataFile,
  MetadataFileError,
} from "./metadata-file.js";
import { Repository } from "./repository.js";
import {
  SourceTemplate,
  InvalidSourceTemplateError as _InvalidSourceTemplateError,
} from "./source-template.js";

export class RulesetRepoError extends UserFacingError {
  constructor(
    public readonly repository: RulesetRepository,
    public readonly moduleRoot: string | null,
    reason: string
  ) {
    super(reason);
  }
}

export class MissingFilesError extends RulesetRepoError {
  constructor(
    repository: RulesetRepository,
    moduleRoot: string,
    public readonly missingFiles: string[]
  ) {
    super(
      repository,
      moduleRoot,
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
      moduleRoot,
      `Invalid metadata template file ${repository.metadataTemplatePath(
        moduleRoot
      )}: ${reason}`
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
      moduleRoot,
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
      null,
      `Invalid config.yml file in ${repository.canonicalName}: ${reason}`
    );
  }
}

export class InvalidSourceTemplateError extends RulesetRepoError {
  constructor(
    repository: RulesetRepository,
    moduleRoot: string,
    reason: string
  ) {
    super(
      repository,
      moduleRoot,
      `Invalid source.template.json file in ${repository.sourceTemplatePath(
        moduleRoot
      )}: ${reason}`
    );
  }
}

export class RulesetRepository extends Repository {
  public static readonly BCR_TEMPLATE_DIR = ".bcr";

  private _sourceTemplate: Record<string, SourceTemplate> = {};
  private _metadataTemplate: Record<string, MetadataFile> = {};
  private _config: Configuration;

  public static async create(
    name: string,
    owner: string,
    verifyAtRef?: string
  ): Promise<RulesetRepository> {
    const rulesetRepo = new RulesetRepository(name, owner);
    await rulesetRepo.shallowCloneAndCheckout(verifyAtRef);

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
      const missingFiles = [];
      for (let file of requiredFiles) {
        if (!fs.existsSync(path.join(rulesetRepo.diskPath, file))) {
          missingFiles.push(file);
        }
      }

      if (missingFiles.length) {
        throw new MissingFilesError(rulesetRepo, root, missingFiles);
      }
    }

    for (let moduleRoot of rulesetRepo._config.moduleRoots) {
      try {
        rulesetRepo._sourceTemplate[moduleRoot] = new SourceTemplate(
          rulesetRepo.sourceTemplatePath(moduleRoot)
        );
        rulesetRepo._metadataTemplate[moduleRoot] = new MetadataFile(
          rulesetRepo.metadataTemplatePath(moduleRoot)
        );
      } catch (e) {
        if (e instanceof _InvalidSourceTemplateError) {
          throw new InvalidSourceTemplateError(
            rulesetRepo,
            moduleRoot,
            e.message
          );
        } else if (e instanceof MetadataFileError) {
          throw new InvalidMetadataTemplateError(
            rulesetRepo,
            moduleRoot,
            e.message
          );
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

  public patchesPath(moduleRoot: string): string {
    return path.resolve(
      this.diskPath,
      RulesetRepository.BCR_TEMPLATE_DIR,
      moduleRoot,
      "patches"
    );
  }

  public sourceTemplate(moduleRoot: string): SourceTemplate {
    return this._sourceTemplate[moduleRoot];
  }

  public metadataTemplate(moduleRoot: string): MetadataFile {
    return this._metadataTemplate[moduleRoot];
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

  public getAllMaintainers(): ReadonlyArray<Maintainer> {
    return Object.values(
      Object.values(this._metadataTemplate)
        .flatMap((template) => template.maintainers)
        .reduce(
          (maintainers, curr) => ({ ...maintainers, [curr.email]: curr }),
          {}
        )
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
