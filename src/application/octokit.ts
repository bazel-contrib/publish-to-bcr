import { Octokit } from '@octokit/rest';
import { getAppAuthorizedOctokit } from '../infrastructure/github.js';
import { SecretsClient } from '../infrastructure/secrets.js';

export async function createAppAuthorizedOctokit(
  secretsClient: SecretsClient
): Promise<Octokit> {
  const [githubAppPrivateKey, githubAppClientId, githubAppClientSecret] =
    await Promise.all([
      secretsClient.accessSecret('github-app-private-key'),
      secretsClient.accessSecret('github-app-client-id'),
      secretsClient.accessSecret('github-app-client-secret'),
    ]);

  return getAppAuthorizedOctokit(
    Number(process.env.GITHUB_APP_ID),
    githubAppPrivateKey,
    githubAppClientId,
    githubAppClientSecret
  );
}

export async function createBotAppAuthorizedOctokit(
  secretsClient: SecretsClient
): Promise<Octokit> {
  const [
    githubBotAppPrivateKey,
    githubBotAppClientId,
    githubBotAppClientSecret,
  ] = await Promise.all([
    secretsClient.accessSecret('github-bot-app-private-key'),
    secretsClient.accessSecret('github-bot-app-client-id'),
    secretsClient.accessSecret('github-bot-app-client-secret'),
  ]);
  return getAppAuthorizedOctokit(
    Number(process.env.GITHUB_BOT_APP_ID),
    githubBotAppPrivateKey,
    githubBotAppClientId,
    githubBotAppClientSecret
  );
}
