import axios from "axios";
import axiosRetry from "axios-retry";
import extractZip from "extract-zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import tar from "tar";
import { UserFacingError } from "./error.js";

import { ModuleFile } from "./module-file.js";

export class UnsupportedArchiveFormat extends UserFacingError {
  constructor(extension: string) {
    super(`Unsupported release archive format ${extension}`);
  }
}

export class ArchiveDownloadError extends UserFacingError {
  constructor(url: string, statusCode: number) {
    super(
      `Failed to download release archive from ${url}. Received status ${statusCode}`
    );
  }
}

export class ReleaseArchive {
  public static async fetch(
    url: string,
    stripPrefix: string
  ): Promise<ReleaseArchive> {
    const filename = url.substring(url.lastIndexOf("/") + 1);
    const downloadedPath = path.join(os.tmpdir(), filename);
    await download(url, downloadedPath);

    return new ReleaseArchive(downloadedPath, stripPrefix);
  }

  private constructor(
    private readonly _diskPath: string,
    private readonly stripPrefix: string
  ) {}

  public async extractModuleFile(moduleRoot: string): Promise<ModuleFile> {
    const extractDir = path.dirname(this._diskPath);

    if (this._diskPath.endsWith(".tar.gz")) {
      await this.extractModuleFileFromTarball(extractDir);
    } else if (this._diskPath.endsWith(".zip")) {
      await this.extractModuleFileFromZip(extractDir);
    } else {
      const extension = this._diskPath.split(".").slice(1).join(".");
      throw new UnsupportedArchiveFormat(extension);
    }

    const extractedModulePath = path.join(
      extractDir,
      moduleRoot,
      "MODULE.bazel"
    );
    return new ModuleFile(extractedModulePath);
  }

  private async extractModuleFileFromTarball(
    extractDir: string
  ): Promise<void> {
    const stripComponents = this.stripPrefix
      ? this.stripPrefix.split("/").length
      : 0;
    await tar.x({
      cwd: extractDir,
      file: this._diskPath,
      strip: stripComponents,
    });
  }

  private async extractModuleFileFromZip(extractDir: string): Promise<void> {
    await extractZip(this._diskPath, { dir: extractDir });
    fs.copyFileSync(
      path.join(extractDir, this.stripPrefix, "MODULE.bazel"),
      path.join(extractDir, "MODULE.bazel")
    );
  }

  public get diskPath(): string {
    return this._diskPath;
  }
}

async function download(url: string, dest: string): Promise<void> {
  const writer = fs.createWriteStream(dest, { flags: "w" });

  // Retry the request in case the artifact is still being uploaded
  axiosRetry(axios, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
  });

  const response = await axios.get(url, {
    responseType: "stream",
  });

  if (response.status !== 200) {
    throw new ArchiveDownloadError(url, response.status);
  }

  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}
