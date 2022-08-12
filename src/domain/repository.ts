import os from "node:os";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { GitClient } from "../infrastructure/git.js";

export class Repository {
  public static gitClient: GitClient;

  private _diskPath: string | null = null;
  public readonly url = `https://github.com/${this.canonicalName}.git`;

  public static fromCanonicalName(canonicalName: string) {
    const [owner, name] = canonicalName.split("/");
    const repository = new Repository(name, owner);
    return repository;
  }

  constructor(public readonly name: string, public readonly owner: string) {}

  public get canonicalName(): string {
    return `${this.owner}/${this.name}`;
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
      this._diskPath = path.join(os.tmpdir(), uuid(), this.name);
      await Repository.gitClient.clone(this.url, this._diskPath);
    }

    await Repository.gitClient.checkout(this._diskPath, ref);
  }

  public equals(other: Repository): boolean {
    return this.name == other.name && this.owner === other.owner;
  }
}
