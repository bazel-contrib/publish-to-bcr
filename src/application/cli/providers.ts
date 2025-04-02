import { Provider } from '@nestjs/common';

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
