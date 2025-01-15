import { Injectable } from '@nestjs/common';
import { simpleGit } from 'simple-git';

@Injectable()
export class GitClient {
  public async shallowClone(
    url: string,
    diskPath: string,
    branchOrTag?: string
  ): Promise<void> {
    await simpleGit().clone(url, diskPath, [
      ...(branchOrTag
        ? [
            // Check out a single commit on the tip of the branch or at a tag
            // From the docs: "--branch can also take tags and detaches the HEAD at that commit in the resulting repository"
            // https://git-scm.com/docs/git-clone#Documentation/git-clone.txt-code--branchcodeemltnamegtem
            '--branch',
            branchOrTag,
            '--single-branch',
          ]
        : [
            // Check out a single commit on the main branch
            '--depth',
            '1',
          ]),
    ]);
  }

  public async setUserNameAndEmail(
    repoPath: string,
    name: string,
    email: string
  ): Promise<void> {
    await simpleGit(repoPath)
      .addConfig('user.name', name)
      .addConfig('user.email', email);
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
    await simpleGit(repoPath).add('./*').commit(commitMsg);
  }

  public async hasRemote(repoPath: string, remote: string): Promise<boolean> {
    return (await simpleGit(repoPath).getRemotes()).some(
      (r) => r.name === remote
    );
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
