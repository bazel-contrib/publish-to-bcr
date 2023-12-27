import { generateKeyPairSync } from "crypto";
import * as mockttp from "mockttp";
import url from "node:url";
import { StubbedServer } from "./stubbed-server";

/**
 * Standin GCP Secret Manager API.
 */
export class FakeSecrets implements StubbedServer {
  private readonly server: mockttp.Mockttp;
  private readonly secrets = new Map<string, string>();

  public static generateRsaPrivateKey(): string {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    return privateKey.export({
      format: "pem",
      type: "pkcs1",
    }) as string;
  }

  public constructor() {
    this.server = mockttp.getLocal();

    this.server.forAnyRequest().thenCallback((request) => {
      const match = request.path.match(
        /\/v1\/projects\/test-project\/secrets\/(.+?)\/versions\/latest.*/
      );
      if (match) {
        const secretName = match[1];
        if (this.secrets.has(secretName)) {
          const secretValue = this.secrets.get(secretName)!;

          return {
            statusCode: 200,
            json: {
              payload: {
                data: Buffer.from(secretValue).toString("base64"),
              },
            },
          };
        }
        throw new Error(`Unmocked secret ${secretName}`);
      }

      throw new Error(`Unmocked request ${request.method} ${request.path}`);
    });
  }

  public async start(): Promise<void> {
    await this.server.start();
  }

  public async reset(): Promise<void> {
    this.secrets.clear();
  }

  public getHost(): string {
    return url.parse(this.server.url).hostname!;
  }

  public getPort(): number {
    return this.server.port;
  }

  public getBaseUrl(): string {
    return this.server.url;
  }

  public async shutdown(): Promise<void> {
    await this.server.stop();
  }

  public mockSecret(name: string, value: string) {
    this.secrets.set(name, value);
  }
}
