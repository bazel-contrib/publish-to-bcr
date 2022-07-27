import { FindRegistryForkService } from "../domain/find-registry-fork.js";
import { Repository } from "../domain/repository.js";
import { CreateEntryService } from "../domain/create-entry.js";
import { PublishEntryService } from "../domain/publish-entry.js";
import { SecretsClient } from "../infrastructure/secrets.js";
import { HandlerFunction } from "@octokit/webhooks/dist-types/types";
import { ReleasePublishedEvent } from "@octokit/webhooks-types";
import { RulesetRepository } from "../domain/ruleset-repository.js";
import { StrategyOptions as GitHubAuth } from "@octokit/auth-app";
import { GitHubClient } from "../infrastructure/github.js";

export class ReleaseEventHandler {
  constructor(
    private readonly githubClient: GitHubClient,
    private readonly secretsClient: SecretsClient,
    private readonly findRegistryForkService: FindRegistryForkService,
    private readonly createEntryService: CreateEntryService,
    private readonly publishEntryService: PublishEntryService
  ) {}

  public readonly handle: HandlerFunction<"release.published", unknown> =
    async (event) => {
      const tag = event.payload.release.tag_name;
      const rulesetRepo = await rulesetRepositoryFromPayload(event.payload);
      const releaser = event.payload.sender.login;

      const appAuth = await this.getGitHubAppAuth();
      this.githubClient.setAppAuth(appAuth);

      console.log(
        `Release published: ${rulesetRepo.canonicalName}@${tag} by @${releaser}`
      );

      const candidateBcrForks =
        await this.findRegistryForkService.findCandidateForks(
          rulesetRepo,
          releaser
        );

      if (candidateBcrForks.length === 0) {
        console.log(
          `Could not find bcr fork for repository ${rulesetRepo.canonicalName}`
        );
        return;
      }

      console.log(
        `Found ${candidateBcrForks.length} candidate forks: ${JSON.stringify(
          candidateBcrForks.map((fork) => fork.canonicalName)
        )}.`
      );

      for (let bcrFork of candidateBcrForks) {
        try {
          console.log(`Selecting fork ${bcrFork.canonicalName}.`);

          const bcr = Repository.fromCanonicalName(
            process.env.BAZEL_CENTRAL_REGISTRY
          );
          const branch = await this.createEntryService.newEntry(
            rulesetRepo,
            bcrFork,
            bcr,
            tag
          );

          console.log(
            `Pushed bcr entry to fork ${bcrFork.canonicalName} on branch ${branch}`
          );

          await this.publishEntryService.sendRequest(
            rulesetRepo,
            tag,
            bcrFork,
            bcr,
            branch,
            releaser
          );

          console.log(`Created pull request against ${bcr.canonicalName}`);
          break;
        } catch (e) {
          console.log(
            `Failed to create pull request using fork ${bcrFork.canonicalName}`
          );
          console.log(e);
        }
      }
    };

  private async getGitHubAppAuth(): Promise<GitHubAuth> {
    const [githubAppPrivateKey, githubAppClientId, githubAppClientSecret] =
      await Promise.all([
        this.secretsClient.accessSecret("github-app-private-key"),
        this.secretsClient.accessSecret("github-app-client-id"),
        this.secretsClient.accessSecret("github-app-client-secret"),
      ]);
    return {
      appId: process.env.GITHUB_APP_ID,
      privateKey: githubAppPrivateKey,
      clientId: githubAppClientId,
      clientSecret: githubAppClientSecret,
    };
  }
}

async function rulesetRepositoryFromPayload(
  payload: ReleasePublishedEvent
): Promise<RulesetRepository> {
  return await RulesetRepository.create(
    payload.repository.name,
    payload.repository.owner.login,
    payload.release.tag_name
  );
}
