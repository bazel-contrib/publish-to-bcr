import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { Injectable } from "@nestjs/common";
import gcpMetadata from "gcp-metadata";
import type { JSONClient } from "google-auth-library/build/src/auth/googleauth";

@Injectable()
export class SecretsClient {
  private readonly googleSecretsClient;

  public constructor() {
    if (process.env.INTEGRATION_TESTING) {
      // Fallback to rest over http and avoid authentication during integration testing.
      // See docs: https://cloud.google.com/nodejs/docs/reference/secret-manager/latest/secret-manager/v1.secretmanagerserviceclient#_google_cloud_secret_manager_v1_SecretManagerServiceClient_constructor_1_
      this.googleSecretsClient = new SecretManagerServiceClient({
        apiEndpoint: process.env.SECRET_MANAGER_HOST,
        fallback: "rest",
        protocol: "http",
        port: Number(process.env.SECRET_MANAGER_PORT),
        // Create a fake auth client to bypass checking for default credentials
        authClient: {
          getRequestHeaders(
            url?: string
          ): Promise<{ [index: string]: string }> {
            return Promise.resolve({});
          },
        } as JSONClient,
      });
    } else {
      this.googleSecretsClient = new SecretManagerServiceClient();
    }
  }

  public async accessSecret(name: string): Promise<string> {
    const projectId = await getProjectIdOfExecutingCloudFunction();
    const secretName = `projects/${projectId}/secrets/${name}/versions/latest`;

    const [response] = await this.googleSecretsClient.accessSecretVersion({
      name: secretName,
    });

    const secret = response.payload!.data!.toString();
    return secret;
  }
}

async function getProjectIdOfExecutingCloudFunction(): Promise<string> {
  if (process.env.INTEGRATION_TESTING) {
    return "test-project";
  }
  return await gcpMetadata.project("numeric-project-id");
}
