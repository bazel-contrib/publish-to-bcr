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
import { NotificationsService } from "./notifications.js";
import { User } from "../domain/user.js";

export class ReleaseEventHandler {
  constructor(
    private readonly githubClient: GitHubClient,
    private readonly secretsClient: SecretsClient,
    private readonly findRegistryForkService: FindRegistryForkService,
    private readonly createEntryService: CreateEntryService,
    private readonly publishEntryService: PublishEntryService,
    private readonly notificationsService: NotificationsService
  ) {}

  public readonly handle: HandlerFunction<"release.published", unknown> =
    async (event) => {
      let releaser: User;
      const repoCanonicalName = `${event.payload.repository.owner.login}/${event.payload.repository.name}`;
      const tag = event.payload.release.tag_name;

      try {
        const [webhookAppAuth, botAppAuth] = await Promise.all([
          this.getGitHubWebhookAppAuth(),
          this.getGitHubBotAppAuth(),
        ]);
        this.githubClient.setAppAuth(webhookAppAuth);

        releaser = await this.githubClient.getRepoUser(
          event.payload.sender.login,
          new Repository(
            event.payload.repository.name,
            event.payload.repository.owner.login
          )
        );

        const rulesetRepo = await rulesetRepositoryFromPayload(event.payload);

        console.log(
          `Release published: ${rulesetRepo.canonicalName}@${tag} by @${releaser.username}`
        );

        const candidateBcrForks =
          await this.findRegistryForkService.findCandidateForks(
            rulesetRepo,
            releaser
          );

        console.log(
          `Found ${candidateBcrForks.length} candidate forks: ${JSON.stringify(
            candidateBcrForks.map((fork) => fork.canonicalName)
          )}.`
        );

        const errors: Error[] = [];
        for (let bcrFork of candidateBcrForks) {
          try {
            console.log(`Selecting fork ${bcrFork.canonicalName}.`);

            const bcr = Repository.fromCanonicalName(
              process.env.BAZEL_CENTRAL_REGISTRY
            );
            await this.createEntryService.createEntryFiles(
              rulesetRepo,
              bcr,
              tag
            );
            const branch = await this.createEntryService.commitEntryToNewBranch(
              rulesetRepo,
              bcr,
              tag,
              releaser
            );
            await this.createEntryService.pushEntryToFork(bcrFork, bcr, branch);

            console.log(
              `Pushed bcr entry to fork ${bcrFork.canonicalName} on branch ${branch}`
            );

            this.githubClient.setAppAuth(botAppAuth);

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
          } catch (error) {
            console.log(
              `Failed to create pull request using fork ${bcrFork.canonicalName}`
            );

            console.log(error);
            errors.push(error);
          }
        }

        if (errors.length > 0) {
          await this.notificationsService.notifyError(
            releaser,
            repoCanonicalName,
            tag,
            errors
          );
          return;
        }
      } catch (error) {
        console.log(error);
        if (releaser) {
          await this.notificationsService.notifyError(
            releaser,
            repoCanonicalName,
            tag,
            [error]
          );
        }
        return;
      }
    };

  private async getGitHubWebhookAppAuth(): Promise<GitHubAuth> {
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

  private async getGitHubBotAppAuth(): Promise<GitHubAuth> {
    const [githubAppPrivateKey, githubAppClientId, githubAppClientSecret] =
      await Promise.all([
        this.secretsClient.accessSecret("github-bot-app-private-key"),
        this.secretsClient.accessSecret("github-bot-app-client-id"),
        this.secretsClient.accessSecret("github-bot-app-client-secret"),
      ]);
    return {
      appId: process.env.GITHUB_BOT_APP_ID,
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
