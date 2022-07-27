import { globbySync } from "globby";
import path from "node:path";
import { Repository } from "./repository.js";

export class RulesetRepository extends Repository {
  private static readonly BCR_TEMPLATE_DIR = ".bcr";

  public static async create(
    name: string,
    owner: string,
    verifyAtRef?: string
  ): Promise<RulesetRepository> {
    const rulesetRepo = new RulesetRepository(name, owner);
    await rulesetRepo.checkout(verifyAtRef);

    const templateFiles = [
      path.join("MODULE.bazel"),
      path.join(RulesetRepository.BCR_TEMPLATE_DIR, "metadata.template.json"),
      path.join(RulesetRepository.BCR_TEMPLATE_DIR, "presubmit.yml"),
      path.join(RulesetRepository.BCR_TEMPLATE_DIR, "source.template.json"),
    ];

    const resolvedFiles = globbySync(templateFiles, {
      onlyFiles: true,
      dot: true,
      cwd: rulesetRepo.diskPath,
    });
    if (resolvedFiles.length !== templateFiles.length) {
      throw new Error(
        `Ruleset repository ${
          rulesetRepo.canonicalName
        } is missing one of the following required files: ${JSON.stringify(
          templateFiles
        )}.`
      );
    }

    return rulesetRepo;
  }

  private constructor(readonly name: string, readonly owner: string) {
    super(name, owner);
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
