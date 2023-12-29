import { createTwoFilesPatch, parsePatch } from "diff";
import { randomBytes } from "node:crypto";
import fs, { readFileSync } from "node:fs";
import path from "node:path";
import { GitClient } from "../infrastructure/git.js";
import { GitHubClient } from "../infrastructure/github.js";
import { UserFacingError } from "./error.js";
import { computeIntegrityHash } from "./integrity-hash.js";
import { MetadataFile } from "./metadata-file.js";
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

export class CreateEntryService {
  constructor(
    private readonly gitClient: GitClient,
    private readonly githubClient: GitHubClient
  ) {}

  public async createEntryFiles(
    rulesetRepo: RulesetRepository,
    bcrRepo: Repository,
    tag: string,
    moduleRoot: string
  ): Promise<void> {
    await Promise.all([rulesetRepo.checkout(tag), bcrRepo.checkout("main")]);
    const version = RulesetRepository.getVersionFromTag(tag);

    const sourceTemplate = rulesetRepo.sourceTemplate(moduleRoot);
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

    const moduleFile = await releaseArchive.extractModuleFile(moduleRoot);

    const bcrEntryPath = path.resolve(
      bcrRepo.diskPath,
      "modules",
      moduleFile.moduleName
    );
    const bcrVersionEntryPath = path.join(bcrEntryPath, version);

    if (!fs.existsSync(bcrEntryPath)) {
      fs.mkdirSync(bcrEntryPath);
    }

    const metadataTemplate = rulesetRepo.metadataTemplate(moduleRoot);

    updateMetadataFile(metadataTemplate, bcrEntryPath, version);

    fs.mkdirSync(bcrVersionEntryPath);

    this.addPatches(
      rulesetRepo,
      sourceTemplate,
      moduleFile,
      bcrVersionEntryPath,
      moduleRoot
    );

    this.patchModuleVersionIfMismatch(
      moduleFile,
      version,
      sourceTemplate,
      bcrVersionEntryPath
    );

    sourceTemplate.save(path.join(bcrVersionEntryPath, "source.json"));
    moduleFile.save(path.join(bcrVersionEntryPath, "MODULE.bazel"));

    fs.copyFileSync(
      rulesetRepo.presubmitPath(moduleRoot),
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
    const authenticatedRemoteUrl =
      await this.githubClient.getAuthenticatedRemoteUrl(bcrForkRepo);

    if (!(await this.gitClient.hasRemote(bcr.diskPath, "authed-fork"))) {
      await this.gitClient.addRemote(
        bcr.diskPath,
        "authed-fork",
        authenticatedRemoteUrl
      );
    }

    if (process.env.INTEGRATION_TESTING) {
      // It is too difficult to mock the responses to `git push` when
      // not using a real git server. Just perform a no-op during testing.
      await this.gitClient.push(bcr.diskPath, "origin", branch);
      return;
    }
    await this.gitClient.push(bcr.diskPath, "authed-fork", branch);
  }

  private addPatches(
    rulesetRepo: RulesetRepository,
    sourceTemplate: SourceTemplate,
    moduleFile: ModuleFile,
    bcrVersionEntryPath: string,
    moduleRoot: string
  ): void {
    const patchesPath = rulesetRepo.patchesPath(moduleRoot);
    if (!fs.existsSync(patchesPath)) {
      return;
    }
    const patches = fs
      .readdirSync(patchesPath)
      .filter((f) => f.endsWith(".patch"));

    if (
      patches.length &&
      !fs.existsSync(path.join(bcrVersionEntryPath, "patches"))
    ) {
      fs.mkdirSync(path.join(bcrVersionEntryPath, "patches"));
    }

    for (const patch of patches) {
      const patchSrc = path.join(patchesPath, patch);
      const patchDest = path.join(bcrVersionEntryPath, "patches", patch);
      fs.mkdirSync;
      fs.copyFileSync(patchSrc, patchDest);
      sourceTemplate.addPatch(patch, computeIntegrityHash(patchDest), 1);

      // If the user-provided patch patches MODULE.bazel, also apply it to
      // the copy in the entry since it needs to be identical to the archived
      // MODULE.bazel with any patches.
      const diffs = parsePatch(readFileSync(patchSrc, "utf8"));
      for (const diff of diffs) {
        if (
          diff.oldFileName === "a/MODULE.bazel" &&
          diff.newFileName === "b/MODULE.bazel"
        ) {
          moduleFile.patchContent(diff);
        }
      }
    }
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

      const patch = createTwoFilesPatch(
        "a/MODULE.bazel",
        "b/MODULE.bazel",
        existingContent,
        stampedContent
      );

      const patchesDir = path.join(bcrVersionEntryPath, "patches");
      if (!fs.existsSync(path.join(bcrVersionEntryPath, "patches"))) {
        fs.mkdirSync(path.join(bcrVersionEntryPath, "patches"));
      }
      const patchFilePath = path.join(patchesDir, patchFileName);
      fs.writeFileSync(patchFilePath, patch);

      sourceTemplate.addPatch(
        patchFileName,
        computeIntegrityHash(patchFilePath),
        1
      );
    }
  }
}

function updateMetadataFile(
  metadataTemplate: MetadataFile,
  bcrEntryPath: string,
  version: string
) {
  // Ignore any versions in the template metadata file since the
  // canonical source for released and yanked versions exists in
  // the metadata file stored in the Bazel Central Registry.
  metadataTemplate.clearVersions();
  metadataTemplate.clearYankedVersions();

  const destPath = path.join(bcrEntryPath, "metadata.json");
  if (fs.existsSync(destPath)) {
    const bcrMetadata = new MetadataFile(destPath);

    if (bcrMetadata.hasVersion(version)) {
      throw new VersionAlreadyPublishedError(version);
    }

    // Add all versions from the BCR metadata
    metadataTemplate.addVersions(...bcrMetadata.versions);
    metadataTemplate.addYankedVersions(bcrMetadata.yankedVersions);
  }

  metadataTemplate.addVersions(version);
  metadataTemplate.save(destPath);
}
