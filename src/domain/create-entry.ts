import fs from "node:fs";
import path from "node:path";
import { GitClient } from "../infrastructure/git.js";
import { GitHubClient } from "../infrastructure/github.js";
import { UserFacingError } from "./error.js";
import { ReleaseHashService } from "./release-hash.js";
import { Repository } from "./repository.js";
import { RulesetRepository } from "./ruleset-repository.js";
import { User } from "./user.js";

export class VersionAlreadyPublishedError extends UserFacingError {
  public constructor(version: string) {
    super(`Version ${version} has already been published.`);
  }
}

export class MetadataParseError extends UserFacingError {
  public constructor(repository: Repository, path: string) {
    super(
      `Could not parse metadata file ${path} from repository ${repository.canonicalName}.`
    );
  }
}

export class CreateEntryService {
  constructor(
    private readonly gitClient: GitClient,
    private readonly githubClient: GitHubClient,
    private readonly releaseHashService: ReleaseHashService
  ) {}

  public async createEntryFiles(
    rulesetRepo: RulesetRepository,
    bcrRepo: Repository,
    tag: string
  ): Promise<void> {
    await Promise.all([rulesetRepo.checkout(tag), bcrRepo.checkout("main")]);

    const version = getVersionFromTag(tag);
    const moduleName = rulesetRepo.moduleName;
    const bcrEntryPath = path.resolve(bcrRepo.diskPath, "modules", moduleName);
    const bcrVersionEntryPath = path.join(bcrEntryPath, version);

    if (!fs.existsSync(bcrEntryPath)) {
      fs.mkdirSync(bcrEntryPath);
    }

    updateMetadataFile(
      rulesetRepo.metadataTemplatePath,
      bcrRepo,
      path.join(bcrEntryPath, "metadata.json"),
      version
    );

    fs.mkdirSync(bcrVersionEntryPath);

    stampModuleFile(
      rulesetRepo.moduleFilePath,
      path.join(bcrVersionEntryPath, "MODULE.bazel"),
      version
    );

    await this.stampSourceFile(
      rulesetRepo.sourceTemplatePath,
      path.join(bcrVersionEntryPath, "source.json"),
      rulesetRepo,
      version,
      tag
    );

    fs.copyFileSync(
      rulesetRepo.presubmitPath,
      path.join(bcrVersionEntryPath, "presubmit.yml")
    );
  }

  public async commitEntryToNewBranch(
    rulesetRepo: Repository,
    bcrRepo: Repository,
    tag: string,
    releaser: User
  ): Promise<string> {
    const repoAndVersion = `${rulesetRepo.canonicalName}@${tag}`;
    const branchName = repoAndVersion;

    await this.gitClient.setUserNameAndEmail(
      bcrRepo.diskPath,
      releaser.name,
      releaser.email
    );
    await this.gitClient.checkoutNewBranchFromHead(
      bcrRepo.diskPath,
      branchName
    );
    await this.gitClient.commitChanges(
      bcrRepo.diskPath,
      `Publish ${repoAndVersion}`
    );

    return branchName;
  }

  public async pushEntryToFork(
    bcrForkRepo: Repository,
    bcr: Repository,
    branch: string
  ): Promise<void> {
    const authenticatedRemoteUrl =
      await this.githubClient.getAuthenticatedRemoteUrl(bcrForkRepo);

    await this.gitClient.addRemote(
      bcr.diskPath,
      "authed-fork",
      authenticatedRemoteUrl
    );
    await this.gitClient.push(bcr.diskPath, "authed-fork", branch);
  }

  private async stampSourceFile(
    sourcePath: string,
    destPath: string,
    rulesetRepo: Repository,
    version: string,
    tag: string
  ): Promise<void> {
    // Substitute variables into source.json
    const sourceContent = fs.readFileSync(sourcePath, { encoding: "utf-8" });
    const substituted = sourceContent
      .replace(/{REPO}/g, rulesetRepo.name)
      .replace(/{OWNER}/g, rulesetRepo.owner)
      .replace(/{VERSION}/g, version)
      .replace(/{TAG}/g, tag);

    // Compute the integrity hash
    const sourceJson = JSON.parse(substituted);

    const digest = await this.releaseHashService.calculate(sourceJson.url);
    sourceJson.integrity = `sha256-${digest}`;

    fs.writeFileSync(
      destPath,
      `${JSON.stringify(sourceJson, undefined, 4)}\n`,
      {
        encoding: "utf-8",
      }
    );
  }
}

function updateMetadataFile(
  sourcePath: string,
  bcrRepo: Repository,
  destPath: string,
  version: string
) {
  let publishedVersions = [];
  if (fs.existsSync(destPath)) {
    try {
      const existingMetadata = JSON.parse(
        fs.readFileSync(destPath, { encoding: "utf-8" })
      );
      publishedVersions = existingMetadata.versions;
    } catch (error) {
      throw new MetadataParseError(bcrRepo, destPath);
    }
  }

  if (publishedVersions.includes(version)) {
    throw new VersionAlreadyPublishedError(version);
  }

  const metadata = JSON.parse(
    fs.readFileSync(sourcePath, {
      encoding: "utf-8",
    })
  );
  metadata.versions = [...publishedVersions, version];

  fs.writeFileSync(destPath, JSON.stringify(metadata, null, 4) + "\n", {
    encoding: "utf-8",
  });
}

function stampModuleFile(
  sourcePath: string,
  destPath: string,
  version: string
) {
  const module = fs.readFileSync(sourcePath, { encoding: "utf-8" });

  const stampedModule = module.replace(
    /(^.*?module\(.*?version\s*=\s*")[\w.]+(".*$)/s,
    `$1${version}$2`
  );

  fs.writeFileSync(destPath, stampedModule, {
    encoding: "utf-8",
  });
}

function getVersionFromTag(version: string): string {
  if (version.startsWith("v")) {
    return version.substring(1);
  }
}
