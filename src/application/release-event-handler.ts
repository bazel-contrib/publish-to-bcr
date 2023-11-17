import { StrategyOptions as GitHubAuth } from "@octokit/auth-app";
import { ReleasePublishedEvent } from "@octokit/webhooks-types";
import { HandlerFunction } from "@octokit/webhooks/dist-types/types";
import { CreateEntryService } from "../domain/create-entry.js";
import { FindRegistryForkService } from "../domain/find-registry-fork.js";
import { Maintainer, MetadataFile } from "../domain/metadata-file.js";
import { PublishEntryService } from "../domain/publish-entry.js";
import { Repository } from "../domain/repository.js";
import {
  RulesetRepoError,
  RulesetRepository,
} from "../domain/ruleset-repository.js";
import { User } from "../domain/user.js";
import { GitHubClient } from "../infrastructure/github.js";
import { SecretsClient } from "../infrastructure/secrets.js";
import { NotificationsService } from "./notifications.js";

interface PublishAttempt {
  readonly successful: boolean;
  readonly bcrFork: Repository;
  readonly error?: Error;
}

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
      const bcr = Repository.fromCanonicalName(
        process.env.BAZEL_CENTRAL_REGISTRY
      );

      const [webhookAppAuth, botAppAuth] = await Promise.all([
        this.getGitHubWebhookAppAuth(),
        this.getGitHubBotAppAuth(),
      ]);
      this.githubClient.setAppAuth(webhookAppAuth);

      const repoCanonicalName = `${event.payload.repository.owner.login}/${event.payload.repository.name}`;
      const repository = repositoryFromPayload(event.payload);
      let releaser = await this.githubClient.getRepoUser(
        event.payload.sender.login,
        repository
      );
      const releaseUrl = event.payload.release.html_url;

      const tag = event.payload.release.tag_name;

      try {
        const createRepoResult = await this.validateRulesetRepoOrNotifyFailure(
          repository,
          tag,
          releaser
        );
        if (!createRepoResult.successful) {
          return;
        }

        const rulesetRepo = createRepoResult.rulesetRepo!;

        console.log(`Release author: ${releaser.username}`);

        releaser = await this.overrideReleaser(releaser, rulesetRepo);

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

        for (let moduleRoot of rulesetRepo.config.moduleRoots) {
          console.log(`Creating BCR entry for module root '${moduleRoot}'`);

          const attempts: PublishAttempt[] = [];

          for (let bcrFork of candidateBcrForks) {
            const attempt = await this.attemptPublish(
              rulesetRepo,
              bcrFork,
              bcr,
              tag,
              moduleRoot,
              releaser,
              releaseUrl,
              webhookAppAuth,
              botAppAuth
            );
            attempts.push(attempt);

            // No need to try other candidate bcr forks if this was successful
            if (attempt.successful) {
              break;
            }
          }

          // Send out error notifications if none of the attempts succeeded
          if (!attempts.some((a) => a.successful)) {
            await this.notificationsService.notifyError(
              releaser,
              rulesetRepo.metadataTemplate(moduleRoot).maintainers,
              rulesetRepo,
              tag,
              attempts.map((a) => a.error!)
            );
          }
        }
      } catch (error) {
        // Handle any other unexpected errors
        console.log(error);

        await this.notificationsService.notifyError(
          releaser,
          [],
          Repository.fromCanonicalName(repoCanonicalName),
          tag,
          [error]
        );

        return;
      }
    };

  private async validateRulesetRepoOrNotifyFailure(
    repository: Repository,
    tag: string,
    releaser: User
  ): Promise<{ rulesetRepo?: RulesetRepository; successful: boolean }> {
    try {
      const rulesetRepo = await RulesetRepository.create(
        repository.name,
        repository.owner,
        tag
      );

      return {
        rulesetRepo,
        successful: true,
      };
    } catch (error) {
      // If the ruleset repo was invalid, then we didn't get the chance to set the fixed releaser.
      // See see if we can scrounge a fixedReleaser from the configuration to send that user an email.
      if (
        error instanceof RulesetRepoError &&
        !!error.repository.config.fixedReleaser
      ) {
        releaser = {
          username: error.repository.config.fixedReleaser.login,
          email: error.repository.config.fixedReleaser.email,
        };
      }

      // Similarly, if there were validation issues with the ruleset repo, we may not have been able
      // to properly parse the maintainers. Do a last-ditch attempt to try to find maintainers so that
      // we can notify them.
      let maintainers: Maintainer[] = [];
      if (error instanceof RulesetRepoError && !!error.moduleRoot) {
        maintainers = MetadataFile.emergencyParseMaintainers(
          error.repository.metadataTemplatePath(error.moduleRoot)
        );
      }

      await this.notificationsService.notifyError(
        releaser,
        maintainers,
        repository,
        tag,
        [error]
      );

      return {
        rulesetRepo: error.repository,
        successful: false,
      };
    }
  }

  private async attemptPublish(
    rulesetRepo: RulesetRepository,
    bcrFork: Repository,
    bcr: Repository,
    tag: string,
    moduleRoot: string,
    releaser: User,
    releaseUrl: string,
    webhookAppAuth: GitHubAuth,
    botAppAuth: GitHubAuth
  ): Promise<PublishAttempt> {
    console.log(`Attempting publish to fork ${bcrFork.canonicalName}.`);

    try {
      await this.createEntryService.createEntryFiles(
        rulesetRepo,
        bcr,
        tag,
        moduleRoot
      );

      this.githubClient.setAppAuth(webhookAppAuth);

      const branch = await this.createEntryService.commitEntryToNewBranch(
        rulesetRepo,
        bcr,
        tag,
        releaser
      );
      await this.createEntryService.pushEntryToFork(bcrFork, bcr, branch);

      console.log(
        `Pushed bcr entry for module '${moduleRoot}' to fork ${bcrFork.canonicalName} on branch ${branch}`
      );

      this.githubClient.setAppAuth(botAppAuth);

      await this.publishEntryService.sendRequest(
        tag,
        bcrFork,
        bcr,
        branch,
        releaser,
        rulesetRepo.metadataTemplate(moduleRoot).maintainers,
        rulesetRepo.getModuleName(moduleRoot),
        releaseUrl
      );

      console.log(`Created pull request against ${bcr.canonicalName}`);
    } catch (error) {
      console.log(
        `Failed to create pull request using fork ${bcrFork.canonicalName}`
      );

      console.log(error);

      return {
        successful: false,
        bcrFork,
        error,
      };
    }

    return {
      successful: true,
      bcrFork,
    };
  }

  private async overrideReleaser(
    releaser: User,
    rulesetRepo: RulesetRepository
  ): Promise<User> {
    // Use the release author unless a fixedReleaser is configured
    if (rulesetRepo.config.fixedReleaser) {
      console.log(
        `Overriding releaser to ${rulesetRepo.config.fixedReleaser.login}`
      );

      // Fetch the releaser to get their name
      const fixedReleaser = await this.githubClient.getRepoUser(
        rulesetRepo.config.fixedReleaser.login,
        rulesetRepo
      );

      return {
        username: rulesetRepo.config.fixedReleaser.login,
        name: fixedReleaser.name,
        email: rulesetRepo.config.fixedReleaser.email,
      };
    }

    return releaser;
  }

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

function repositoryFromPayload(payload: ReleasePublishedEvent): Repository {
  return new Repository(
    payload.repository.name,
    payload.repository.owner.login
  );
}
