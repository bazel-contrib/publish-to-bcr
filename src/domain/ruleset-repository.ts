import path from "node:path";
import fs from "node:fs";
import { Repository } from "./repository.js";
import { UserFacingError } from "./error.js";

export class MissingFilesError extends UserFacingError {
  constructor(
    public readonly repoName: string,
    public readonly repoOwner: string,
    public readonly missingFiles: string[]
  ) {
    super(
      `\
Could not locate the following required files:
${missingFiles.map((missingFile) => `  ${missingFile}`).join("\n")}
Did you forget to add them to your ruleset repository? See instructions here: https://github.com/bazel-contrib/publish-to-bcr/blob/main/templates`
    );
  }
}

export class InvalidModuleFileError extends UserFacingError {
  constructor(
    public readonly repoName: string,
    public readonly repoOwner: string,
    public readonly message: string
  ) {
    super(
      `Unable to parse the MODULE.bazel file in ${repoOwner}/${repoName}. Please double check that it is correct.`
    );
  }
}

export class RulesetRepository extends Repository {
  public static readonly BCR_TEMPLATE_DIR = ".bcr";

  private _moduleName: string;

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
      throw new MissingFilesError(name, owner, missingFiles);
    }

    rulesetRepo._moduleName = rulesetRepo.parseModuleName();

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
    throw new InvalidModuleFileError(
      this.name,
      this.owner,
      `Could not parse your module's name from MODULE.bazel.`
    );
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
}
