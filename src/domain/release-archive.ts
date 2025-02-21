import fs from 'node:fs';
import path from 'node:path';

import extractZip from 'extract-zip';
import tar from 'tar';

import { decompress as decompressXz } from '../infrastructure/xzdec/xzdec.js';
import { Artifact, ArtifactDownloadError } from './artifact.js';
import { UserFacingError } from './error.js';
import { ModuleFile } from './module-file.js';

export class UnsupportedArchiveFormat extends UserFacingError {
  constructor(
    public readonly url: string,
    public readonly extension: string
  ) {
    super();
  }
}

export class ArchiveDownloadError extends UserFacingError {
  constructor(
    public readonly url: string,
    public readonly statusCode: number
  ) {
    let msg = `Failed to download release archive from ${url}. Received status ${statusCode}`;

    if (statusCode === 404) {
      msg +=
        "\n\nDouble check that the `url` in your ruleset's .bcr/source.template.json is correct. Also ensure that the release archive is uploaded as part of publishing the release rather than uploaded afterward.";
    }
    super(msg);
  }
}

export class MissingModuleFileError extends UserFacingError {
  constructor(pathInArchive: string, stripPrefix: string) {
    super(
      `Could not find MODULE.bazel in release archive at ${pathInArchive}.\nIs the strip prefix in source.template.json correct? (currently it's '${stripPrefix}')`
    );
  }
}

export class ReleaseArchive {
  public static readonly SUPPORTED_EXTENSIONS = [
    '.zip',
    '.tar',
    '.tar.gz',
    '.tar.xz',
  ];
  public static async fetch(
    url: string,
    stripPrefix: string
  ): Promise<ReleaseArchive> {
    const artifact = new Artifact(url);

    try {
      await artifact.download();
    } catch (e) {
      if (e instanceof ArtifactDownloadError) {
        throw new ArchiveDownloadError(e.url, e.statusCode);
      }
      throw e;
    }

    return new ReleaseArchive(artifact, stripPrefix);
  }

  private extractDir: string | undefined;

  private constructor(
    public readonly artifact: Artifact,
    private readonly stripPrefix: string
  ) {}

  public async extractModuleFile(): Promise<ModuleFile> {
    this.extractDir = path.dirname(this.artifact.diskPath);

    if (this.isSupportedTarball()) {
      await this.extractReleaseTarball(this.extractDir);
    } else if (this.artifact.diskPath.endsWith('.zip')) {
      await this.extractReleaseZip(this.extractDir);
    } else {
      const extension = this.artifact.diskPath.split('.').slice(1).join('.');
      throw new UnsupportedArchiveFormat(this.artifact.url, extension);
    }

    const pathInArchive = path.join(this.stripPrefix, 'MODULE.bazel');

    const extractedModulePath = path.join(this.extractDir, pathInArchive);

    if (!fs.existsSync(extractedModulePath)) {
      throw new MissingModuleFileError(`./${pathInArchive}`, this.stripPrefix);
    }

    return new ModuleFile(extractedModulePath);
  }

  private isSupportedTarball(): boolean {
    if (this.artifact.diskPath.endsWith('.tar')) {
      return true;
    }
    if (this.artifact.diskPath.endsWith('.tar.gz')) {
      return true;
    }
    if (this.artifact.diskPath.endsWith('.tar.xz')) {
      return true;
    }
    return false;
  }

  private async extractReleaseTarball(extractDir: string): Promise<void> {
    if (this.artifact.diskPath.endsWith('.tar.xz')) {
      const reader = fs.createReadStream(this.artifact.diskPath);
      const writer = tar.x({
        cwd: extractDir,
      });
      await decompressXz(reader, writer);
      await new Promise((resolve) => {
        writer.on('finish', resolve);
        writer.end();
      });

      return;
    }

    await tar.x({
      cwd: extractDir,
      file: this.artifact.diskPath,
    });
  }

  private async extractReleaseZip(extractDir: string): Promise<void> {
    await extractZip(this.artifact.diskPath, { dir: extractDir });
  }

  /**
   * Delete the release archive and extracted contents
   */
  public cleanup(): void {
    this.artifact.cleanup();

    if (this.extractDir) {
      fs.rmSync(this.extractDir, { force: true, recursive: true });
    }
  }
}
