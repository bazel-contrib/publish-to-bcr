import axios, { AxiosResponse } from "axios";
import axiosRetry from "axios-retry";
import extractZip from "extract-zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseUrl } from "node:url";
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
    let msg = `Failed to download release archive from ${url}. Received status ${statusCode}`;

    if (statusCode === 404) {
      msg +=
        "\n\nDouble check that the `url` in your ruleset's .bcr/source.template.json is correct. Also ensure that the release archive is uploaded as part of publishing the release rather than uploaded afterward.";
    }
    super(msg);
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
  if (process.env.INTEGRATION_TESTING) {
    // Point downloads to the standin github server
    // during integration testing.
    const [host, port] =
      process.env.GITHUB_API_ENDPOINT.split("://")[1].split(":");

    const parsed = parseUrl(url);
    parsed.host = host;
    parsed.port = port;

    url = `http://${host}:${port}${parsed.path}`;
  }

  const writer = fs.createWriteStream(dest, { flags: "w" });

  // Retry the request in case the artifact is still being uploaded
  axiosRetry(axios, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
  });

  let response: AxiosResponse;

  try {
    response = await axios.get(url, {
      responseType: "stream",
    });
  } catch (e: any) {
    // https://axios-http.com/docs/handling_errors
    if (e.response) {
      throw new ArchiveDownloadError(url, e.response.status);
    } else if (e.request) {
      throw new Error(`GET ${url} failed; no response received`);
    } else {
      throw new Error(`Failed to GET ${url} failed: ${e.message}`);
    }
  }

  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}
