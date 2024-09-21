import { Inject, Injectable } from "@nestjs/common";
import { Octokit } from "@octokit/rest";
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
import { NotificationsService } from "./notifications.js";

interface PublishAttempt {
  readonly successful: boolean;
  readonly bcrFork: Repository;
  readonly error?: Error;
}

@Injectable()
export class ReleaseEventHandler {
  constructor(
    @Inject("rulesetRepoGitHubClient")
    private rulesetRepoGitHubClient: GitHubClient,
    @Inject("appOctokit") private appOctokit: Octokit,
    private readonly findRegistryForkService: FindRegistryForkService,
    private readonly createEntryService: CreateEntryService,
    private readonly publishEntryService: PublishEntryService,
    private readonly notificationsService: NotificationsService
  ) {}

  public readonly handle: HandlerFunction<"release.published", unknown> =
    async (event) => {
      const repository = repositoryFromPayload(event.payload);
      const bcr = Repository.fromCanonicalName(
        process.env.BAZEL_CENTRAL_REGISTRY
      );

      let releaser = await this.rulesetRepoGitHubClient.getRepoUser(
        event.payload.sender.login,
        repository
      );
      const releaseUrl = event.payload.release.html_url;

      const tag = event.payload.release.tag_name;

      const createRepoResult = await this.validateRulesetRepoOrNotifyFailure(
        repository,
        tag,
        releaser
      );
      if (!createRepoResult.successful) {
        return;
      }

      const rulesetRepo = createRepoResult.rulesetRepo!;
      console.log(
        `Release published: ${rulesetRepo.canonicalName}@${tag} by @${releaser.username}`
      );

      console.log(`Release author: ${releaser.username}`);
      releaser = await this.overrideReleaser(releaser, rulesetRepo);

      const moduleNames = [];
      let branch: string;
      const candidateBcrForks: Repository[] = [];
      try {
        for (const moduleRoot of rulesetRepo.config.moduleRoots) {
          console.log(`Creating BCR entry for module root '${moduleRoot}'`);

          const { moduleName } = await this.createEntryService.createEntryFiles(
            rulesetRepo,
            bcr,
            tag,
            moduleRoot
          );
          moduleNames.push(moduleName);
        }

        branch = await this.createEntryService.commitEntryToNewBranch(
          rulesetRepo,
          bcr,
          tag,
          releaser
        );

        candidateBcrForks.push(
          ...(await this.findRegistryForkService.findCandidateForks(
            rulesetRepo,
            releaser
          ))
        );

        console.log(
          `Found ${candidateBcrForks.length} candidate forks: ${JSON.stringify(
            candidateBcrForks.map((fork) => fork.canonicalName)
          )}.`
        );
      } catch (error) {
        console.log(error);
        await this.notificationsService.notifyError(
          releaser,
          rulesetRepo.getAllMaintainers(),
          rulesetRepo,
          tag,
          [error]
        );
        return;
      }

      const attempts: PublishAttempt[] = [];

      for (let bcrFork of candidateBcrForks) {
        const bcrForkGitHubClient = await GitHubClient.forRepoInstallation(
          this.appOctokit,
          bcrFork
        );

        const attempt = await this.attemptPublish(
          bcrFork,
          bcr,
          tag,
          branch,
          moduleNames,
          releaseUrl,
          bcrForkGitHubClient
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
          rulesetRepo.getAllMaintainers(),
          rulesetRepo,
          tag,
          attempts.map((a) => a.error!)
        );
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
    bcrFork: Repository,
    bcr: Repository,
    tag: string,
    branch: string,
    moduleNames: string[],
    releaseUrl: string,
    bcrForkGitHubClient: GitHubClient
  ): Promise<PublishAttempt> {
    console.log(`Attempting publish to fork ${bcrFork.canonicalName}.`);

    try {
      await this.createEntryService.pushEntryToFork(
        bcrFork,
        bcr,
        branch,
        bcrForkGitHubClient
      );

      if (moduleNames.length === 1) {
        console.log(
          `Pushed bcr entry for module '${moduleNames[0]}' to fork ${bcrFork.canonicalName} on branch ${branch}`
        );
      } else {
        console.log(
          `Pushed bcr entry for modules '${moduleNames.join(", ")}' to fork ${
            bcrFork.canonicalName
          } on branch ${branch}`
        );
      }

      await this.publishEntryService.publish(
        tag,
        bcrFork,
        bcr,
        branch,
        moduleNames,
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
      const fixedReleaser = await this.rulesetRepoGitHubClient.getRepoUser(
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
}

function repositoryFromPayload(payload: ReleasePublishedEvent): Repository {
  return new Repository(
    payload.repository.name,
    payload.repository.owner.login
  );
}
