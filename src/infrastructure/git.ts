import { simpleGit } from "simple-git";

export class GitClient {
  public async clone(
    url: string,
    repoPath: string,
    branch?: string
  ): Promise<void> {
    const options = ["--depth", "1"];
    if (branch) {
      options.push("--branch", branch);
    }
    await simpleGit().clone(url, repoPath, options);
  }

  public async checkout(repoPath: string, ref?: string): Promise<void> {
    await simpleGit(repoPath).clean(["f", "f", "x", "d"]).checkout(ref);
  }

  public async setUserNameAndEmail(
    repoPath: string,
    name: string,
    email: string
  ): Promise<void> {
    await simpleGit(repoPath)
      .addConfig("user.name", name)
      .addConfig("user.email", email);
  }

  public async checkoutNewBranchFromHead(
    repoPath: string,
    branch: string
  ): Promise<void> {
    await simpleGit(repoPath).checkoutLocalBranch(branch);
  }

  public async commitChanges(
    repoPath: string,
    commitMsg: string
  ): Promise<void> {
    await simpleGit(repoPath).add("./*").commit(commitMsg);
  }

  public async addRemote(
    repoPath: string,
    remote: string,
    url: string
  ): Promise<void> {
    await simpleGit(repoPath).addRemote(remote, url);
  }

  public async push(
    repoPath: string,
    remote: string,
    branch: string
  ): Promise<void> {
    await simpleGit(repoPath).push(remote, branch);
  }
}
