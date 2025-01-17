import { Repository } from './repository.js';
import url from 'node:url';

export class GitHubRepository<T extends Repository> {
  public readonly owner: string;
  public readonly repo: string;

  public constructor(public readonly repository: Readonly<T>) {
    // git url

    // ssh url

    // html url
    let url = repository.url;
    if (url.startsWith('git@')) {
      url = `ssh://${url}`;
    }
    // const parsed = url.parse(repository.url);
  }
}
