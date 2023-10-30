import { HttpFunction } from "@google-cloud/functions-framework";
import { Webhooks } from "@octokit/webhooks";
import { CreateEntryService } from "../../domain/create-entry.js";
import { FindRegistryForkService } from "../../domain/find-registry-fork.js";
import { PublishEntryService } from "../../domain/publish-entry.js";
import { Repository } from "../../domain/repository.js";
import { EmailClient } from "../../infrastructure/email.js";
import { GitClient } from "../../infrastructure/git.js";
import { GitHubClient } from "../../infrastructure/github.js";
import { SecretsClient } from "../../infrastructure/secrets.js";
import { NotificationsService } from "../notifications.js";
import { ReleaseEventHandler } from "../release-event-handler.js";

// Setup application dependencies using constructor dependency injection.
const secretsClient = new SecretsClient();
const gitClient = new GitClient();
const githubClient = new GitHubClient();
const emailClient = new EmailClient();
const findRegistryForkService = new FindRegistryForkService(githubClient);
const createEntryService = new CreateEntryService(gitClient, githubClient);
const publishEntryService = new PublishEntryService(githubClient);
const notificationsService = new NotificationsService(
  emailClient,
  secretsClient,
  githubClient
);

const releaseEventHandler = new ReleaseEventHandler(
  githubClient,
  secretsClient,
  findRegistryForkService,
  createEntryService,
  publishEntryService,
  notificationsService
);
Repository.gitClient = gitClient;

// Handle incoming GitHub webhook messages. This is the entrypoint for
// the webhook cloud function.
export const handleGithubWebhookEvent: HttpFunction = async (
  request,
  response
) => {
  const githubWebhookSecret = await secretsClient.accessSecret(
    "github-app-webhook-secret"
  );

  const webhooks = new Webhooks({ secret: githubWebhookSecret });
  webhooks.on("release.published", (event) =>
    releaseEventHandler.handle(event)
  );

  await webhooks.verifyAndReceive({
    id: request.headers["x-github-delivery"] as string,
    name: request.headers["x-github-event"] as any,
    payload: request.body,
    signature: request.headers["x-hub-signature-256"] as string,
  });

  response.status(200).send();
};
