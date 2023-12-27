import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { GitClient } from "../infrastructure/git.js";

export class Repository {
  public static gitClient: GitClient;

  private _diskPath: string | null = null;

  public static fromCanonicalName(canonicalName: string) {
    const [owner, name] = canonicalName.split("/");
    const repository = new Repository(name, owner);
    return repository;
  }

  constructor(public readonly name: string, public readonly owner: string) {}

  public get canonicalName(): string {
    return `${this.owner}/${this.name}`;
  }

  public get url(): string {
    if (process.env.INTEGRATION_TESTING) {
      // During integration testing all remote repos are instead
      // sourced from defiend disk path.
      return path.join(process.env.PREPARED_FIXTURES_PATH, this.name);
    }
    return `https://github.com/${this.canonicalName}.git`;
  }

  public isCheckedOut(): boolean {
    return this._diskPath != null;
  }

  public get diskPath(): string {
    if (!this.isCheckedOut()) {
      throw new Error(`Repository ${this.canonicalName} is not checked out`);
    }
    return this._diskPath;
  }

  public async checkout(ref?: string): Promise<void> {
    if (!this.isCheckedOut()) {
      this._diskPath = path.join(os.tmpdir(), randomUUID(), this.name);
      await Repository.gitClient.clone(this.url, this._diskPath);
    }

    await Repository.gitClient.checkout(this._diskPath, ref);
  }

  public equals(other: Repository): boolean {
    return this.name == other.name && this.owner === other.owner;
  }
}
