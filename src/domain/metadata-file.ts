import fs from 'node:fs';

import { compareVersions } from './version.js';

export class MetadataFileError extends Error {
  constructor(
    public readonly path: string,
    message: string
  ) {
    super(message);
  }
}

// Examples: https://docs.google.com/document/d/1moQfNcEIttsk6vYanNKIy3ZuK53hQUFq1b1r0rmsYVg/edit#bookmark=id.1i90c6c14zvx
// Discussion: https://github.com/bazel-contrib/publish-to-bcr/issues/59#issuecomment-1784979303
// Name is required, github handle and email are optional.
export interface Maintainer {
  name: string;
  email?: string;
  github?: string;
  github_user_id?: number; // https://github.com/bazelbuild/bazel-central-registry/pull/4191
}

export class MetadataFile {
  private readonly metadata: {
    versions: string[];
    yankedVersions: string[];
  } & any;

  constructor(readonly filepath: string) {
    let json: any;

    try {
      json = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch (e) {
      throw new MetadataFileError(filepath, e.message);
    }

    if (
      !('versions' in json) ||
      !Array.isArray(json.versions) ||
      !json.versions.every((v: any) => typeof v === 'string')
    ) {
      throw new MetadataFileError(filepath, "could not parse 'versions'");
    }

    if (
      !('yanked_versions' in json) ||
      typeof json.yanked_versions !== 'object' ||
      Array.isArray(json.yanked_versions) ||
      !Object.entries(json.yanked_versions).every(
        ([k, v]) => typeof k === 'string' && typeof v === 'string'
      )
    ) {
      throw new MetadataFileError(
        filepath,
        "could not parse 'yanked_versions'"
      );
    }

    if (
      'maintainers' in json &&
      (!Array.isArray(json.maintainers) ||
        !json.maintainers.every((m: any) => typeof m === 'object'))
    ) {
      throw new MetadataFileError(filepath, "could not parse 'maintainers'");
    }

    this.metadata = json;
    this.metadata.versions.sort(compareVersions);
  }

  public get maintainers(): readonly Maintainer[] {
    return (this.metadata.maintainers || []) as Maintainer[];
  }

  public updateMaintainerUserId(github: string, githubUserId: number) {
    this.metadata.maintainers.find(
      (m: Maintainer) => !!m.github && m.github === github
    )!.github_user_id = githubUserId;
  }

  public get versions(): readonly string[] {
    return this.metadata.versions;
  }

  public get yankedVersions(): Readonly<Record<string, string>> {
    return this.metadata.yanked_versions;
  }

  public clearVersions(): void {
    this.metadata.versions = [];
  }

  public clearYankedVersions(): void {
    this.metadata.yanked_versions = {};
  }

  public addVersions(...versions: readonly string[]): void {
    this.metadata.versions.push(...versions);
    this.metadata.versions.sort(compareVersions);
  }

  public addYankedVersions(yankedVersions: Record<string, string>): void {
    this.metadata.yanked_versions = {
      ...this.metadata.yanked_versions,
      ...yankedVersions,
    };
  }

  public hasVersion(version: string): boolean {
    return this.metadata.versions.includes(version);
  }

  public save(destPath: string) {
    fs.writeFileSync(
      destPath,
      `${JSON.stringify(this.metadata, undefined, 4)}\n`
    );
  }

  // In an already erroneous situation, just try to fetch as many `maintainers`
  // as we can from a metadata.json file, ignoring most of the usual validation.
  public static emergencyParseMaintainers(filepath: string): Maintainer[] {
    try {
      const content = fs.readFileSync(filepath, 'utf8');
      const json = JSON.parse(content);

      const maintainers: Maintainer[] = [];
      if ('maintainers' in json) {
        if (!Array.isArray(json.maintainers)) {
          return [];
        }

        for (const maintainer of json.maintainers) {
          if (typeof maintainer.name === 'string') {
            maintainers.push(maintainer as Maintainer);
          }
        }

        return maintainers;
      }
    } catch {} // eslint-disable-line no-empty

    return [];
  }
}
