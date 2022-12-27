import { createPatch } from "diff";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { GitClient } from "../infrastructure/git.js";
import {
  GitHubClient,
  MissingRepositoryInstallationError,
} from "../infrastructure/github.js";
import { UserFacingError } from "./error.js";
import { computeIntegrityHash } from "./integrity-hash.js";
import { ModuleFile } from "./module-file.js";
import { ReleaseArchive } from "./release-archive.js";
import { Repository } from "./repository.js";
import { RulesetRepository } from "./ruleset-repository.js";
import { SourceTemplate } from "./source-template.js";
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

export class AppNotInstalledToForkError extends UserFacingError {
  public constructor(repository: Repository) {
    super(
      `App is not installed to candidate bcr fork ${repository.canonicalName}. You need to configure the app for at least one bazel-central-registry fork. The fork can be in the ruleset's account in the release author's account.`
    );
  }
}

export class CreateEntryService {
  constructor(
    private readonly gitClient: GitClient,
    private readonly githubClient: GitHubClient
  ) {}

  public async createEntryFiles(
    rulesetRepo: RulesetRepository,
    bcrRepo: Repository,
    tag: string
  ): Promise<void> {
    await Promise.all([rulesetRepo.checkout(tag), bcrRepo.checkout("main")]);

    const version = getVersionFromTag(tag);

    const sourceTemplate = rulesetRepo.sourceTemplate;
    sourceTemplate.substitute(
      rulesetRepo.owner,
      rulesetRepo.name,
      tag,
      version
    );

    const releaseArchive = await ReleaseArchive.fetch(
      sourceTemplate.url,
      sourceTemplate.stripPrefix
    );
    const integrityHash = computeIntegrityHash(releaseArchive.diskPath);
    sourceTemplate.setIntegrityHash(integrityHash);

    const moduleFile = await releaseArchive.extractModuleFile();

    const bcrEntryPath = path.resolve(
      bcrRepo.diskPath,
      "modules",
      moduleFile.moduleName
    );
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

    this.patchModuleVersionIfMismatch(
      moduleFile,
      version,
      sourceTemplate,
      bcrVersionEntryPath
    );

    sourceTemplate.save(path.join(bcrVersionEntryPath, "source.json"));
    moduleFile.save(path.join(bcrVersionEntryPath, "MODULE.bazel"));

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
    const branchName = `${repoAndVersion}-${randomBytes(4).toString("hex")}`;

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
    let authenticatedRemoteUrl: string;

    try {
      authenticatedRemoteUrl =
        await this.githubClient.getAuthenticatedRemoteUrl(bcrForkRepo);
    } catch (error) {
      if (error instanceof MissingRepositoryInstallationError) {
        throw new AppNotInstalledToForkError(bcrForkRepo);
      }
      throw error;
    }

    await this.gitClient.addRemote(
      bcr.diskPath,
      "authed-fork",
      authenticatedRemoteUrl
    );
    await this.gitClient.push(bcr.diskPath, "authed-fork", branch);
  }

  // The version in the archived MODULE.bazel version should match the release version.
  // If it doesn't, add a patch to set the correct version. This is useful when a release
  // archive is just an archive of the source, and the source MODULE.bazel is kept unstamped
  // (e.g., has '0.0.0' as the version).
  private patchModuleVersionIfMismatch(
    moduleFile: ModuleFile,
    version: string,
    sourceTemplate: SourceTemplate,
    bcrVersionEntryPath: string
  ): void {
    if (moduleFile.version !== version) {
      console.log(
        "Archived MODULE.bazel version does not match release version. Creating a version patch."
      );
      const patchFileName = "module_dot_bazel_version.patch";
      const existingContent = moduleFile.content;
      moduleFile.stampVersion(version);
      const stampedContent = moduleFile.content;

      const patch = createPatch(
        "MODULE.bazel",
        existingContent,
        stampedContent
      );

      const patchesDir = path.join(bcrVersionEntryPath, "patches");
      fs.mkdirSync(path.join(bcrVersionEntryPath, "patches"));
      const patchFilePath = path.join(patchesDir, patchFileName);
      fs.writeFileSync(patchFilePath, patch);

      sourceTemplate.addPatch(
        patchFileName,
        computeIntegrityHash(patchFilePath),
        0
      );
    }
  }
}

function updateMetadataFile(
  sourcePath: string,
  bcrRepo: Repository,
  destPath: string,
  version: string
) {
  let publishedVersions = [];
  let yankedVersions = {};
  if (fs.existsSync(destPath)) {
    try {
      const existingMetadata = JSON.parse(fs.readFileSync(destPath, "utf8"));
      publishedVersions = existingMetadata.versions;
      yankedVersions = existingMetadata.yanked_versions;
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
  metadata.yanked_versions = { ...metadata.yanked_versions, ...yankedVersions };

  fs.writeFileSync(destPath, JSON.stringify(metadata, null, 4) + "\n");
}

function getVersionFromTag(tag: string): string {
  if (tag.startsWith("v")) {
    return tag.substring(1);
  }
  return tag;
}
