import { HttpFunction } from "@google-cloud/functions-framework";
import { Webhooks } from "@octokit/webhooks";
import { CreateEntryService } from "../../domain/create-entry.js";
import { PublishEntryService } from "../../domain/publish-entry.js";
import { FindRegistryForkService } from "../../domain/find-registry-fork.js";
import { GitHubClient } from "../../infrastructure/github.js";
import { SecretsClient } from "../../infrastructure/secrets.js";
import { ReleaseEventHandler } from "../release-event-handler.js";
import { GitClient } from "../../infrastructure/git.js";
import { Repository } from "../../domain/repository.js";

// Setup application dependencies using constructor dependency injection.
const secretsClient = new SecretsClient();
const gitClient = new GitClient();
const githubClient = new GitHubClient();
const findRegistryForkService = new FindRegistryForkService(githubClient);
const createEntryService = new CreateEntryService(gitClient, githubClient);
const publishEntryService = new PublishEntryService(githubClient);
const releaseEventHandler = new ReleaseEventHandler(
  githubClient,
  secretsClient,
  findRegistryForkService,
  createEntryService,
  publishEntryService
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
