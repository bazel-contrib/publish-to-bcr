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
import { EmailClient } from "../infrastructure/email.js";
import { GitClient } from "../infrastructure/git.js";
import { GitHubClient } from "../infrastructure/github.js";
import { SecretsClient } from "../infrastructure/secrets.js";
import { NotificationsService } from "./notifications.js";
import {
  createAppAuthorizedOctokit,
  createBotAppAuthorizedOctokit,
} from "./octokit.js";

interface PublishAttempt {
  readonly successful: boolean;
  readonly bcrFork: Repository;
  readonly error?: Error;
}

export class ReleaseEventHandler {
  constructor(private readonly secretsClient: SecretsClient) {}

  public readonly handle: HandlerFunction<"release.published", unknown> =
    async (event) => {
      const repository = repositoryFromPayload(event.payload);
      const bcr = Repository.fromCanonicalName(
        process.env.BAZEL_CENTRAL_REGISTRY
      );

      // The "app" refers to the public facing GitHub app installed to users'
      // ruleset repos and BCR Forks that creates and pushes the entry to the
      // fork. The "bot app" refers to the private app only installed to the
      // canonical BCR which has reduced permissions and only opens PRs.
      const appOctokit = await createAppAuthorizedOctokit(this.secretsClient);
      const rulesetGitHubClient = await GitHubClient.forRepoInstallation(
        appOctokit,
        repository,
        event.payload.installation.id
      );

      const botAppOctokit = await createBotAppAuthorizedOctokit(
        this.secretsClient
      );
      const bcrGitHubClient = await GitHubClient.forRepoInstallation(
        botAppOctokit,
        bcr
      );

      const gitClient = new GitClient();
      Repository.gitClient = gitClient;

      const emailClient = new EmailClient();
      const findRegistryForkService = new FindRegistryForkService(
        rulesetGitHubClient
      );
      const publishEntryService = new PublishEntryService(bcrGitHubClient);
      const notificationsService = new NotificationsService(
        emailClient,
        this.secretsClient,
        rulesetGitHubClient
      );

      const repoCanonicalName = `${event.payload.repository.owner.login}/${event.payload.repository.name}`;
      let releaser = await rulesetGitHubClient.getRepoUser(
        event.payload.sender.login,
        repository
      );
      const releaseUrl = event.payload.release.html_url;

      const tag = event.payload.release.tag_name;

      try {
        const createRepoResult = await this.validateRulesetRepoOrNotifyFailure(
          repository,
          tag,
          releaser,
          notificationsService
        );
        if (!createRepoResult.successful) {
          return;
        }

        const rulesetRepo = createRepoResult.rulesetRepo!;

        console.log(`Release author: ${releaser.username}`);

        releaser = await this.overrideReleaser(
          releaser,
          rulesetRepo,
          rulesetGitHubClient
        );

        console.log(
          `Release published: ${rulesetRepo.canonicalName}@${tag} by @${releaser.username}`
        );

        const candidateBcrForks =
          await findRegistryForkService.findCandidateForks(
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
            const forkGitHubClient = await GitHubClient.forRepoInstallation(
              appOctokit,
              bcrFork
            );
            const createEntryService = new CreateEntryService(
              gitClient,
              forkGitHubClient,
              bcrGitHubClient
            );

            const attempt = await this.attemptPublish(
              rulesetRepo,
              bcrFork,
              bcr,
              tag,
              moduleRoot,
              releaser,
              releaseUrl,
              createEntryService,
              publishEntryService
            );
            attempts.push(attempt);

            // No need to try other candidate bcr forks if this was successful
            if (attempt.successful) {
              break;
            }
          }

          // Send out error notifications if none of the attempts succeeded
          if (!attempts.some((a) => a.successful)) {
            await notificationsService.notifyError(
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

        await notificationsService.notifyError(
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
    releaser: User,
    notificationsService: NotificationsService
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

      await notificationsService.notifyError(
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
    createEntryService: CreateEntryService,
    publishEntryService: PublishEntryService
  ): Promise<PublishAttempt> {
    console.log(`Attempting publish to fork ${bcrFork.canonicalName}.`);

    try {
      await createEntryService.createEntryFiles(
        rulesetRepo,
        bcr,
        tag,
        moduleRoot
      );

      const branch = await createEntryService.commitEntryToNewBranch(
        rulesetRepo,
        bcr,
        tag,
        releaser
      );
      await createEntryService.pushEntryToFork(bcrFork, bcr, branch);

      console.log(
        `Pushed bcr entry for module '${moduleRoot}' to fork ${bcrFork.canonicalName} on branch ${branch}`
      );

      await publishEntryService.sendRequest(
        tag,
        bcrFork,
        bcr,
        branch,
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
    rulesetRepo: RulesetRepository,
    githubClient: GitHubClient
  ): Promise<User> {
    // Use the release author unless a fixedReleaser is configured
    if (rulesetRepo.config.fixedReleaser) {
      console.log(
        `Overriding releaser to ${rulesetRepo.config.fixedReleaser.login}`
      );

      // Fetch the releaser to get their name
      const fixedReleaser = await githubClient.getRepoUser(
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
