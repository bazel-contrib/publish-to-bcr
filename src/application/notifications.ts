import { UserFacingError } from "../domain/error.js";
import { User } from "../domain/user.js";
import { Authentication, EmailClient } from "../infrastructure/email.js";
import { SecretsClient } from "../infrastructure/secrets.js";

export class NotificationsService {
  private readonly sender: string;
  private readonly debugEmail?: string;
  private emailAuth: Authentication;
  constructor(
    private readonly emailClient: EmailClient,
    private readonly secretsClient: SecretsClient
  ) {
    if (process.env.NOTIFICATIONS_EMAIL === undefined) {
      throw new Error("Missing NOTIFICATIONS_EMAIL environment variable.");
    }
    this.sender = process.env.NOTIFICATIONS_EMAIL;

    if (!!process.env.DEBUG_EMAIL) {
      this.debugEmail = process.env.DEBUG_EMAIL;
    }
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

  public async notifyError(
    recipient: User,
    repoCanonicalName: string,
    tag: string,
    errors: Error[]
  ): Promise<void> {
    await this.setAuth();

    await this.sendErrorEmailToUser(recipient, repoCanonicalName, tag, errors);

    if (this.debugEmail) {
      await this.sendErrorEmailToDevs(
        recipient,
        repoCanonicalName,
        tag,
        errors
      );
    }
  }

  private async sendErrorEmailToUser(
    recipient: User,
    repoCanonicalName: string,
    tag: string,
    errors: Error[]
  ): Promise<void> {
    const subject = `Publish to BCR`;

    let content = `\
Failed to publish entry for ${repoCanonicalName}@${tag} to the Bazel Central Registry.

`;

    const friendlyErrors = errors.filter(
      (error) => error instanceof UserFacingError
    );

    for (let error of friendlyErrors) {
      content += `${error.message}\n\n`;
    }

    if (!friendlyErrors.length) {
      content +=
        "An unknown error occurred. Please report an issue here: https://github.com/bazel-contrib/publish-to-bcr/issues.";
    }

    console.log(`Sending error email to ${recipient.email}`);
    console.log(`Subject: ${subject}`);
    console.log(`Content:`);
    console.log(content);

    await this.emailClient.sendEmail(
      recipient.email,
      this.sender,
      subject,
      content
    );
  }

  private async sendErrorEmailToDevs(
    user: User,
    repoCanonicalName: string,
    tag: string,
    errors: Error[]
  ): Promise<void> {
    const subject = `Publish to BCR Error: ${repoCanonicalName}`;

    const unknownErrors = errors.filter(
      (error) => !(error instanceof UserFacingError)
    );

    if (!unknownErrors.length) {
      return;
    }

    let content = `\
User ${user.username} <${user.email}> encountered ${unknownErrors.length} unknown error(s) trying publish entry for ${repoCanonicalName}@${tag} to the Bazel Central Registry.

`;
    for (let error of unknownErrors) {
      content += `${error.message}\n${error.stack}\n\n`;
    }

    await this.emailClient.sendEmail(
      this.debugEmail!,
      this.sender,
      subject,
      content
    );
  }
}
