import { Provider } from '@nestjs/common';

import { DownloadOptions } from '../../domain/artifact.js';
import {
  getUnauthorizedOctokit,
  GitHubClient,
} from '../../infrastructure/github.js';

export const UNAUTHENTICATED_GITHUB_CLIENT_PROVIDER: Provider = {
  provide: 'unauthedGitHubClient',
  useFactory(): GitHubClient {
    return new GitHubClient(getUnauthorizedOctokit());
  },
};

export const ARTIFACT_DOWNLOAD_OPTIONS: Provider<DownloadOptions> = {
  provide: 'artifactDownloadOptions',
  useValue: {
    backoffDelayFactor: 2000,
  },
};
