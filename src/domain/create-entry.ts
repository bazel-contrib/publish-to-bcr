import fs, { readFileSync } from 'node:fs';
import path from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import { createTwoFilesPatch, parsePatch } from 'diff';

import { DownloadOptions } from './artifact.js';
import { AttestationsTemplate } from './attestations-template.js';
import { UserFacingError } from './error.js';
import { computeIntegrityHash } from './integrity-hash.js';
import { MetadataFile } from './metadata-file.js';
import {
  ModuleFile,
  PatchModuleError as _PatchModuleError,
} from './module-file.js';
import { ReleaseArchive } from './release-archive.js';
import { SourceTemplate } from './source-template.js';
import { UserService } from './user.js';

export class VersionAlreadyPublishedError extends UserFacingError {
  public constructor(
    public readonly moduleName: string,
    public readonly version: string
  ) {
    super(`${moduleName}@${version} has already been published`);
  }
}

export class PatchModuleError extends UserFacingError {
  public constructor(patchPath: string) {
    super(`Failed to apply patch ${patchPath} to MODULE.bazel`);
  }
}

@Injectable()
export class CreateEntryService {
  public constructor(
    private readonly userService: UserService,
    @Inject('artifactDownloadOptions')
    private readonly artifactDownloadOptions: DownloadOptions
  ) {}

  public async createEntryFiles(
    metadataTemplate: MetadataFile,
    sourceTemplate: SourceTemplate,
    presubmitPath: string,
    patchesPath: string,
    registryPath: string,
    version: string,
    attestationsTemplate: AttestationsTemplate | null = null
  ): Promise<{ moduleName: string }> {
    sourceTemplate.substitute({ VERSION: version });
    sourceTemplate.validateFullySubstituted();

    console.error(`Fetching release archive ${sourceTemplate.url}`);
    const releaseArchive = await ReleaseArchive.fetch(
      sourceTemplate.url,
      sourceTemplate.stripPrefix,
      this.artifactDownloadOptions
    );

    try {
      sourceTemplate.setIntegrityHash(
        releaseArchive.artifact.computeIntegrityHash()
      );

      const moduleFile = await releaseArchive.extractModuleFile();

      const bcrEntryPath = path.resolve(
        registryPath,
        'modules',
        moduleFile.moduleName
      );
      const bcrVersionEntryPath = path.join(bcrEntryPath, version);

      if (!fs.existsSync(bcrEntryPath)) {
        fs.mkdirSync(bcrEntryPath);
      }

      await this.updateMetadataFile(
        moduleFile.moduleName,
        metadataTemplate,
        bcrEntryPath,
        version
      );

      fs.mkdirSync(bcrVersionEntryPath);

      this.addPatches(
        patchesPath,
        sourceTemplate,
        moduleFile,
        bcrVersionEntryPath
      );

      this.patchModuleVersionIfMismatch(
        moduleFile,
        version,
        sourceTemplate,
        bcrVersionEntryPath
      );

      sourceTemplate.save(path.join(bcrVersionEntryPath, 'source.json'));
      moduleFile.save(path.join(bcrVersionEntryPath, 'MODULE.bazel'));

      fs.copyFileSync(
        presubmitPath,
        path.join(bcrVersionEntryPath, 'presubmit.yml')
      );

      if (attestationsTemplate) {
        attestationsTemplate.substitute({ VERSION: version });
        attestationsTemplate.validateFullySubstituted();
        await attestationsTemplate.computeIntegrityHashes(
          this.artifactDownloadOptions
        );
        attestationsTemplate.save(
          path.join(bcrVersionEntryPath, 'attestations.json')
        );
      }

      return { moduleName: moduleFile.moduleName };
    } finally {
      releaseArchive.cleanup();
    }
  }

  private addPatches(
    patchesPath: string,
    sourceTemplate: SourceTemplate,
    moduleFile: ModuleFile,
    bcrVersionEntryPath: string
  ): void {
    if (!fs.existsSync(patchesPath)) {
      return;
    }
    const patches = fs
      .readdirSync(patchesPath)
      .filter((f) => f.endsWith('.patch'));

    if (
      patches.length &&
      !fs.existsSync(path.join(bcrVersionEntryPath, 'patches'))
    ) {
      fs.mkdirSync(path.join(bcrVersionEntryPath, 'patches'));
    }

    for (const patch of patches) {
      const patchSrc = path.join(patchesPath, patch);
      const patchDest = path.join(bcrVersionEntryPath, 'patches', patch);
      fs.copyFileSync(patchSrc, patchDest);
      sourceTemplate.addPatch(patch, computeIntegrityHash(patchDest), 1);

      // If the user-provided patch patches MODULE.bazel, also apply it to
      // the copy in the entry since it needs to be identical to the archived
      // MODULE.bazel with any patches.
      const diffs = parsePatch(readFileSync(patchSrc, 'utf8'));
      for (const diff of diffs) {
        if (
          diff.oldFileName === 'a/MODULE.bazel' &&
          diff.newFileName === 'b/MODULE.bazel'
        ) {
          try {
            moduleFile.patchContent(diff);
          } catch (e) {
            if (e instanceof _PatchModuleError) {
              throw new PatchModuleError(patchSrc);
            }
            throw e;
          }
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
      console.error(
        `The release archive's MODULE.bazel version ${moduleFile.version} does not match release version ${version}.`,
        'Creating a version patch.'
      );
      const patchFileName = 'module_dot_bazel_version.patch';
      const existingContent = moduleFile.content;
      moduleFile.stampVersion(version);
      const stampedContent = moduleFile.content;

      const patch = createTwoFilesPatch(
        'a/MODULE.bazel',
        'b/MODULE.bazel',
        existingContent,
        stampedContent
      );

      const patchesDir = path.join(bcrVersionEntryPath, 'patches');
      if (!fs.existsSync(path.join(bcrVersionEntryPath, 'patches'))) {
        fs.mkdirSync(path.join(bcrVersionEntryPath, 'patches'));
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

  private async updateMetadataFile(
    moduleName: string,
    metadataTemplate: MetadataFile,
    bcrEntryPath: string,
    version: string
  ) {
    // Ignore any versions in the template metadata file since the
    // canonical source for released and yanked versions exists in
    // the metadata file stored in the Bazel Central Registry.
    metadataTemplate.clearVersions();
    metadataTemplate.clearYankedVersions();

    await this.updateMaintainerIdsIfMissing(metadataTemplate);

    const destPath = path.join(bcrEntryPath, 'metadata.json');
    if (fs.existsSync(destPath)) {
      const bcrMetadata = new MetadataFile(destPath);

      if (bcrMetadata.hasVersion(version)) {
        throw new VersionAlreadyPublishedError(moduleName, version);
      }

      // Add all versions from the BCR metadata
      metadataTemplate.addVersions(...bcrMetadata.versions);
      metadataTemplate.addYankedVersions(bcrMetadata.yankedVersions);
    }

    metadataTemplate.addVersions(version);
    metadataTemplate.save(destPath);
  }

  private updateMaintainerIdsIfMissing(metadata: MetadataFile): Promise<void> {
    return Promise.all(
      metadata.maintainers
        .filter((m) => !!m.github && !m.github_user_id)
        .map((m) =>
          this.userService
            .getUser(m.github)
            .then((u) => metadata.updateMaintainerUserId(m.github!, u.id))
            .catch(() =>
              console.error(
                `Warning: failed to fetch github user id for ${m.github}; not auto-populating the maintainer's github_user_id`
              )
            )
        )
    ).then();
  }
}
