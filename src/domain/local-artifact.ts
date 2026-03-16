import fs from 'fs';
import path from 'path';
import { None, Option, Some } from 'ts-results-es';

export class LocalArtifacts {
  private readonly searchPaths: string[] = [];

  public addSearchPath(path: string) {
    this.searchPaths.push(path);
  }

  public search(url: string): Option<string> {
    const basename = path.basename(new URL(url).pathname);
    for (const searchPath of this.searchPaths) {
      const artifactPath = path.join(searchPath, basename);
      if (fs.existsSync(artifactPath)) {
        return Some(artifactPath);
      }
    }
    return None;
  }
}
