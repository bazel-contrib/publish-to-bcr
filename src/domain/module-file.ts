import { ParsedDiff, applyPatch } from "diff";
import fs from "node:fs";

export class ModuleFile {
  private moduleContent: string;

  constructor(filePath: string) {
    this.moduleContent = fs.readFileSync(filePath, "utf8");
  }

  public get moduleName(): string {
    // See https://cs.opensource.google/bazel/bazel/+/master:src/main/java/com/google/devtools/build/lib/cmdline/RepositoryName.java
    const regex = /module\([^)]*?name\s*=\s*"([a-z]([a-z0-9._-]*[a-z0-9])?)"/s;
    const name = this.moduleContent.match(regex)[1];
    return name;
  }

  public get version(): string {
    const regex = /module\([^)]*?version\s*=\s*"(.+?)"/s;
    const version = this.moduleContent.match(regex)[1];
    return version;
  }

  public get content(): string {
    return this.moduleContent;
  }

  public stampVersion(version: string): void {
    this.moduleContent = this.moduleContent.replace(
      /(^.*?module\(.*?version\s*=\s*")[\w.]+(".*$)/s,
      `$1${version}$2`
    );
  }

  public save(destPath: string) {
    fs.writeFileSync(destPath, this.moduleContent);
  }

  public patchContent(patch: ParsedDiff): void {
    this.moduleContent = applyPatch(this.moduleContent, patch);
  }
}
