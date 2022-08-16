import { User } from "../domain/user.js";
import { Authentication, EmailClient } from "../infrastructure/email.js";
import { SecretsClient } from "../infrastructure/secrets.js";

export class NotificationsService {
  private readonly sender: string;
  private emailAuth: Authentication;
  constructor(
    private readonly emailClient: EmailClient,
    private readonly secretsClient: SecretsClient
  ) {
    if (process.env.NOTIFICATIONS_EMAIL === undefined) {
      throw new Error("Missing NOTIFICATIONS_EMAIL environment variable.");
    }
    this.sender = process.env.NOTIFICATIONS_EMAIL;
  }

  private async setAuth() {
    if (!this.emailAuth) {
      const [user, pass] = await Promise.all([
        this.secretsClient.accessSecret("notifications-email-user"),
        this.secretsClient.accessSecret("notifications-email-password"),
      ]);

      this.emailAuth = {
        user,
        pass,
      };
    }

    this.emailClient.setAuth(this.emailAuth);
  }

  public async notifySuccess(recipient: User): Promise<void> {
    await this.setAuth();
    await this.emailClient.sendEmail(
      recipient.email,
      this.sender,
      "Publish to BCR [no-reply]",
      "Successfully published pull request to the Bazel Central Registry."
    );
  }

  public async notifyError(recipient: User): Promise<void> {
    await this.setAuth();
    await this.emailClient.sendEmail(
      recipient.email,
      this.sender,
      "Publish to BCR [no-reply]",
      "Failed"
    );
  }
}
