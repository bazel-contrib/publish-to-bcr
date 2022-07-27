import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import gcpMetadata from "gcp-metadata";

export class SecretsClient {
  private readonly googleSecretsClient = new SecretManagerServiceClient();

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
  return await gcpMetadata.project("numeric-project-id");
}
