import { ContextIdFactory, NestFactory } from "@nestjs/core";
import { Webhooks } from "@octokit/webhooks";
import { SecretsClient } from "../../infrastructure/secrets.js";
import { ReleaseEventHandler } from "../release-event-handler.js";
import { AppModule } from "./app.module.js";


const handleGithubWebhookEvent = async (
  request: any,
  response: any
) => {
  const app = await NestFactory.createApplicationContext(AppModule);

  const secretsClient = app.get(SecretsClient);
  const githubWebhookSecret = await secretsClient.accessSecret(
    "github-app-webhook-secret"
  );

  const webhooks = new Webhooks({ secret: githubWebhookSecret });
  webhooks.on("release.published", async (event) => {
    // Register the webhook event as the NestJS "request" so that it's available to inject.
    const contextId = ContextIdFactory.create();
    app.registerRequestByContextId(event, contextId);

    const releaseEventHandler = await app.resolve(
      ReleaseEventHandler,
      contextId
    );
    await releaseEventHandler.handle(event);
  });

  console.log("request body", request.body);

  await webhooks.verifyAndReceive({
    id: request.headers["x-github-delivery"] as string,
    name: request.headers["x-github-event"] as any,
    payload: request.body,
    signature: request.headers["x-hub-signature-256"] as string,
  });

  await app.close();
  response.status(200).send();
};

export default handleGithubWebhookEvent;