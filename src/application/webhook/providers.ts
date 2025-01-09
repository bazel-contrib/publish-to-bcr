import { Provider, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Octokit } from "@octokit/rest";
import { EmitterWebhookEvent } from "@octokit/webhooks";
import { Repository } from "../../domain/repository.js";
import { GitHubClient } from "../../infrastructure/github.js";
import { SecretsClient } from "../../infrastructure/secrets.js";
import {
  createAppAuthorizedOctokit,
  createBotAppAuthorizedOctokit,
} from "../octokit.js";

export const APP_OCTOKIT_PROVIDER: Provider = {
  // Provide an Octokit instance authorized for the user GitHub app,
  // which users install to their ruleset and BCR fork.
  provide: "appOctokit",
  useFactory: (secretsClient: SecretsClient): Promise<Octokit> => {
    return createAppAuthorizedOctokit(secretsClient);
  },
  inject: [SecretsClient],
};

export const BCR_APP_OCTOKIT_PROVIDER: Provider = {
  // Provide an Octokit instance authorized for the bcr GitHub app,
  // which is installed to the BCR repo.
  provide: "bcrAppOctokit",
  useFactory: (secretsClient: SecretsClient): Promise<Octokit> => {
    return createBotAppAuthorizedOctokit(secretsClient);
  },
  inject: [SecretsClient],
};

export const RULESET_REPO_GITHUB_CLIENT_PROVIDER: Provider = {
  // Get a GitHub client authorized for the installation of the user
  // app to the ruleset repo.
  provide: "rulesetRepoGitHubClient",
  useFactory: async (
    event: EmitterWebhookEvent<"release.published">,
    appOctokit: Octokit
  ): Promise<GitHubClient> => {
    const installationId = event.payload.installation.id;

    const rulesetRepo = new Repository(
      event.payload.repository.name,
      event.payload.repository.owner.login
    );

    const githubClient = await GitHubClient.forRepoInstallation(
      appOctokit,
      rulesetRepo.owner,
      rulesetRepo.name,
      installationId
    );
    return githubClient;
  },
  scope: Scope.REQUEST,
  inject: [REQUEST, "appOctokit"],
};

export const BCR_GITHUB_CLIENT_PROVIDER: Provider = {
  // Get a GitHub client authorized for the installation of the BCR
  // app to the bazel central registry.
  provide: "bcrGitHubClient",
  useFactory: async (bcrAppOctokit: Octokit): Promise<GitHubClient> => {
    const bcr = Repository.fromCanonicalName(
      process.env.BAZEL_CENTRAL_REGISTRY
    );

    const githubClient = await GitHubClient.forRepoInstallation(
      bcrAppOctokit,
      bcr.owner,
      bcr.name
    );
    return githubClient;
  },
  inject: ["bcrAppOctokit"],
};
