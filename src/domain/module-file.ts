import fs from 'node:fs';

import { applyPatch, ParsedDiff } from 'diff';

export class PatchModuleError extends Error {
  public constructor() {
    super('Failed to apply patch to MODULE.bazel file');
  }
}

export class ModuleNameError extends Error {
  public constructor(public readonly path: string) {
    super(`Failed to parse module name from ${path}`);
  }
}

export class ModuleFile {
  private moduleContent: string;

  constructor(private filePath: string) {
    this.moduleContent = fs.readFileSync(this.filePath, 'utf8');
  }

  public get moduleName(): string {
    // See https://cs.opensource.google/bazel/bazel/+/master:src/main/java/com/google/devtools/build/lib/cmdline/RepositoryName.java
    const regex = /module\([^)]*?name\s*=\s*"([a-z]([a-z0-9._-]*[a-z0-9])?)"/s;
    const matches = this.moduleContent.match(regex);
    if (matches === null) {
      throw new ModuleNameError(this.filePath);
    }
    return matches[1];
  }

  public get version(): string | undefined {
    const regex = /module\([^)]*?version\s*=\s*"(.+?)"/s;
    const match = this.moduleContent.match(regex);
    return match ? match[1] : undefined;
  }

  public get content(): string {
    return this.moduleContent;
  }

  public stampVersion(version: string): void {
    if (this.version !== undefined) {
      // update the version
      this.moduleContent = this.moduleContent.replace(
        /(^.*?module\(.*?version\s*=\s*")[\w.]*(".*$)/s,
        `$1${version}$2`
      );
    } else {
      // add the version
      this.moduleContent = this.moduleContent.replace(
        /(^.*?module\(.*?),?(\s*)\)/s,
        `$1,\n    version = "${version}",\n)`
      );
    }
  }

  public save(destPath: string) {
    fs.writeFileSync(destPath, this.moduleContent);
  }

  public patchContent(patch: ParsedDiff): void {
    const result = applyPatch(this.moduleContent, patch);

    if (result === false) {
      throw new PatchModuleError();
    }

    this.moduleContent = result;
  }
}
