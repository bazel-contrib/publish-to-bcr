import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse as parseUrl } from 'node:url';

import axios, { AxiosError, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';

import { computeIntegrityHash } from './integrity-hash.js';

export class ArtifactDownloadError extends Error {
  constructor(
    public readonly url: string,
    public readonly statusCode: number
  ) {
    super(
      `Failed to download artifact from ${url}. Received status ${statusCode}`
    );
  }
}

export interface DownloadOptions {
  backoffDelayFactor: number;
  ghToken?: string;
}

const GITHUB_RELEASES_URL_REGEX =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/(.+)$/;

function parseGitHubReleasesUrl(
  url: string
): { owner: string; repo: string; tag: string; filename: string } | null {
  const match = GITHUB_RELEASES_URL_REGEX.exec(url);
  if (!match) {
    return null;
  }
  return {
    owner: match[1],
    repo: match[2],
    tag: match[3],
    filename: match[4],
  };
}

/**
 * An artifact that can be downloaded and have its integrity hash computed.
 */
export class Artifact {
  public static readonly MAX_RETRIES = 3;
  private _diskPath: string | null = null;
  public constructor(public readonly url: string) {}

  public async download(options: DownloadOptions): Promise<void> {
    let url = this.url;
    if (this._diskPath !== null) {
      throw new Error(
        `Artifact ${url} already downloaded to ${this._diskPath}`
      );
    }

    const parsed = parseUrl(url);

    if (process.env.INTEGRATION_TESTING) {
      // Point downloads to the standin github server
      // during integration testing.
      const [host, port] =
        process.env.GITHUB_API_ENDPOINT.split('://')[1].split(':');

      parsed.host = host;
      parsed.port = port;

      url = `http://${host}:${port}${parsed.path}`;
    }

    const filename = path.basename(parsed.pathname);

    const dest = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-')),
      filename
    );

    // Support downloading from another location on disk.
    // Useful for swapping in a local path for e2e tests.
    if (url.startsWith('file://')) {
      fs.copyFileSync(url.substring('file://'.length), dest);
      this._diskPath = dest;
      return;
    }

    const writer = fs.createWriteStream(dest, { flags: 'w' });

    // Retry the request in case the artifact is still being uploaded.
    axiosRetry(axios, {
      onRetry(retryCount, error, _requestConfig) {
        console.error(`Failed to download artifact; ${error.message}`);
        console.error(
          `Retry atempt ${retryCount} / ${Artifact.MAX_RETRIES}...`
        );
      },
      retries: Artifact.MAX_RETRIES,
      retryDelay: exponentialDelay(options.backoffDelayFactor),
      shouldResetTimeout: true,
      retryCondition: defaultRetryPlus404,
    });

    let response: AxiosResponse;

    try {
      response = await axios.get(url, {
        responseType: 'stream',
      });
    } catch (e: any) {
      if (
        e.response?.status === 404 &&
        options.ghToken &&
        GITHUB_RELEASES_URL_REGEX.test(this.url)
      ) {
        try {
          await this.downloadViaGitHubApi(this.url, options.ghToken, dest);
          this._diskPath = dest;
          return;
        } catch {
          // fall through to original error
        }
      }
      // https://axios-http.com/docs/handling_errors
      if (e.response) {
        throw new ArtifactDownloadError(url, e.response.status);
      } else if (e.request) {
        throw new Error(`GET ${url} failed; no response received`);
      } else {
        throw new Error(`Failed to GET ${url} failed: ${e.message}`);
      }
    }

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', () => {
        this._diskPath = dest;
        resolve(null);
      });
      writer.on('error', reject);
    });
  }

  private async downloadViaGitHubApi(
    originalUrl: string,
    token: string,
    dest: string
  ): Promise<void> {
    const parsed = parseGitHubReleasesUrl(originalUrl);
    if (!parsed) {
      throw new Error(`Cannot parse GitHub releases URL: ${originalUrl}`);
    }
    const { owner, repo, tag, filename } = parsed;

    const apiBase =
      process.env.GITHUB_API_ENDPOINT ?? 'https://api.github.com';
    const headers = { Authorization: `Bearer ${token}` };

    const releasesResponse = await axios.get(
      `${apiBase}/repos/${owner}/${repo}/releases`,
      { headers }
    );

    const release = releasesResponse.data.find(
      (r: any) => r.tag_name === tag
    );
    if (!release) {
      throw new Error(`No release found with tag_name=${tag}`);
    }

    const asset = release.assets.find((a: any) => a.name === filename);
    if (!asset) {
      throw new Error(
        `No asset found with name=${filename} in release ${tag}`
      );
    }

    const assetResponse = await axios.get(
      `${apiBase}/repos/${owner}/${repo}/releases/assets/${asset.id}`,
      {
        headers: { ...headers, Accept: 'application/octet-stream' },
        responseType: 'stream',
      }
    );

    const writer = fs.createWriteStream(dest, { flags: 'w' });
    assetResponse.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  public get diskPath(): string {
    if (this._diskPath === null) {
      throw new Error(`The artifact ${this.url} has not been downloaded yet`);
    }

    return this._diskPath;
  }

  public computeIntegrityHash(): string {
    if (this._diskPath === null) {
      throw new Error(
        `The artifact ${this.url} must be downloaded before an integrity hash can be calculated`
      );
    }
    return computeIntegrityHash(this._diskPath);
  }

  public cleanup(): void {
    fs.rmSync(this._diskPath, { force: true });
    this._diskPath = null;
  }
}

function exponentialDelay(
  backoffDelayFactor: number
): (retryCount: number, error: AxiosError | undefined) => number {
  return (retryCount: number, error: AxiosError | undefined) => {
    // Delay factor can be overridden for testing with env `BACKOFF_DELAY_FACTOR`.
    const delayFactor =
      Number(process.env.BACKOFF_DELAY_FACTOR) || backoffDelayFactor;
    return axiosRetry.exponentialDelay(retryCount, error, delayFactor);
  };
}

function defaultRetryPlus404(error: AxiosError): boolean {
  // Publish-to-BCR needs to support retrying when GitHub returns 404
  // in order to support automated release workflows that upload artifacts
  // within a minute or so of publishing a release.
  // Apart from this case, use the default retry condition.
  return (
    error.response.status === 404 ||
    axiosRetry.isNetworkOrIdempotentRequestError(error)
  );
}
