import { ChildProcess, spawn } from 'child_process';
import { TestAccount } from 'nodemailer';
import portfinder from 'portfinder';

import { PREPARED_FIXTURES_PATH } from '../helpers/fixture';
import { StubbedServer } from './stubbed-server';

/**
 * Run the Cloud Functions runtime framework locally.
 */
export class CloudFunctions implements StubbedServer {
  private functionsFrameworkProcess: ChildProcess;
  private port: number;

  public constructor(
    private readonly github: StubbedServer,
    private readonly secrets: StubbedServer,
    private readonly emailAccount: TestAccount
  ) {}

  public async start(): Promise<void> {
    this.port = await portfinder.getPortPromise();

    this.functionsFrameworkProcess = spawn(
      `${process.env.TEST_SRCDIR}/${process.env.TEST_WORKSPACE}/node_modules/.bin/functions-framework`,
      [
        '--target=handleGithubWebhookEvent',
        '--signature-type=http',
        `--port=${this.port}`,
        `--source=src/dist`,
      ],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          INTEGRATION_TESTING: '1',
          PREPARED_FIXTURES_PATH,
          SMTP_HOST: this.emailAccount.smtp.host,
          SMTP_PORT: this.emailAccount.smtp.port.toString(),
          NOTIFICATIONS_EMAIL: this.emailAccount.user,
          SECRET_MANAGER_HOST: this.secrets.getHost(),
          SECRET_MANAGER_PORT: this.secrets.getPort().toString(),
          BAZEL_CENTRAL_REGISTRY: 'bazelbuild/bazel-central-registry',
          GITHUB_APP_ID: '1234',
          GITHUB_BOT_APP_ID: '5678',
          GITHUB_API_ENDPOINT: `http://${this.github.getHost()}:${this.github.getPort()}`,
        },
      }
    );

    // Give the cloud functions service some time to boot up
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  public async shutdown(): Promise<void> {
    this.functionsFrameworkProcess.kill();
  }
  public async reset(): Promise<void> {
    // There is nothing to reset
  }
  public getHost(): string {
    return 'localhost';
  }
  public getPort(): number {
    return this.port;
  }
  public getBaseUrl(): string {
    return `http://${this.getHost()}:${this.getPort()}`;
  }
}
