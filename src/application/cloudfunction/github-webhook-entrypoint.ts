import { HttpFunction } from "@google-cloud/functions-framework";
import { Webhooks } from "@octokit/webhooks";
import { SecretsClient } from "../../infrastructure/secrets.js";
import { ReleaseEventHandler } from "../release-event-handler.js";

// Handle incoming GitHub webhook messages. This is the entrypoint for
// the webhook cloud function.
export const handleGithubWebhookEvent: HttpFunction = async (
  request,
  response
) => {
  // Setup application dependencies using constructor dependency injection.
  const secretsClient = new SecretsClient();

  const releaseEventHandler = new ReleaseEventHandler(secretsClient);

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
