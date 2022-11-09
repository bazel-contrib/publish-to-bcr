import extractZip from "extract-zip";
import fs from "node:fs";
import https from "node:https";
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

  public async extractModuleFile(): Promise<ModuleFile> {
    const extractDir = path.dirname(this._diskPath);

    if (this._diskPath.endsWith(".tar.gz")) {
      await this.extractModuleFileFromTarball(extractDir);
    } else if (this._diskPath.endsWith(".zip")) {
      await this.extractModuleFileFromZip(extractDir);
    } else {
      const extension = this._diskPath.split(".").slice(1).join(".");
      throw new UnsupportedArchiveFormat(extension);
    }

    const extractedModulePath = path.join(extractDir, "MODULE.bazel");
    return new ModuleFile(extractedModulePath);
  }

  private async extractModuleFileFromTarball(
    extractDir: string
  ): Promise<void> {
    await tar.x(
      {
        cwd: extractDir,
        file: this._diskPath,
        strip: this.stripPrefix.split("/").length,
      },
      [path.posix.join(this.stripPrefix, "MODULE.bazel")]
    );
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

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode === 200) {
        const file = fs.createWriteStream(dest, { flags: "w" });
        file.on("finish", () => resolve());
        file.on("error", (err) => {
          file.close();
          fs.unlink(dest, () => reject(err.message));
          reject(err);
        });
        response.pipe(file);
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        // Redirect
        download(response.headers.location, dest).then(() => resolve());
      } else {
        reject(
          `Server responded with ${response.statusCode}: ${response.statusMessage}`
        );
      }
    });

    request.on("error", (err) => {
      reject(err.message);
    });
  });
}
