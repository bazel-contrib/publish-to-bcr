import { Injectable } from '@nestjs/common';
import { UserFacingError } from '../domain/error.js';
import { Maintainer } from '../domain/metadata-file.js';
import { Repository } from '../domain/repository.js';
import { User, UserService } from '../domain/user.js';
import { Authentication, EmailClient } from '../infrastructure/email.js';
import { SecretsClient } from '../infrastructure/secrets.js';

@Injectable()
export class NotificationsService {
  private readonly sender: string;
  private readonly debugEmail?: string;
  private emailAuth: Authentication;

  constructor(
    private readonly emailClient: EmailClient,
    private readonly secretsClient: SecretsClient,
    private readonly userService: UserService
  ) {
    if (process.env.NOTIFICATIONS_EMAIL === undefined) {
      throw new Error('Missing NOTIFICATIONS_EMAIL environment variable.');
    }
    this.sender = process.env.NOTIFICATIONS_EMAIL;

    if (!!process.env.DEBUG_EMAIL) {
      this.debugEmail = process.env.DEBUG_EMAIL;
    }
  }

  private async setAuth() {
    if (!this.emailAuth) {
      const [user, pass] = await Promise.all([
        this.secretsClient.accessSecret('notifications-email-user'),
        this.secretsClient.accessSecret('notifications-email-password'),
      ]);

      this.emailAuth = {
        user,
        pass,
      };
    }

    this.emailClient.setAuth(this.emailAuth);
  }

  public async notifyError(
    releaseAuthor: User,
    maintainers: ReadonlyArray<Maintainer>,
    rulesetRepo: Repository,
    tag: string,
    errors: Error[]
  ): Promise<void> {
    await this.setAuth();

    const recipientEmails = new Set<string>();

    // Send email to the release author
    recipientEmails.add(releaseAuthor.email);

    // Send email to maintainers to who listed their email
    const maintainersWithEmail = maintainers.filter((m) => !!m.email);
    maintainersWithEmail.forEach((m) => recipientEmails.add(m.email));

    // Send email to maintainers who listed their github handle and have
    // a public email on their github profile
    const maintainersWithOnlyGithubHandle = maintainers.filter(
      (m) => !!m.github && !m.email
    );
    const fetchedEmails = (
      await Promise.all(
        maintainersWithOnlyGithubHandle.map((m) =>
          this.userService.getUser(m.github)
        )
      )
    )
      .filter((u) => !!u.email)
      .map((u) => u.email);
    fetchedEmails.forEach((e) => recipientEmails.add(e));

    await this.sendErrorEmail(
      Array.from(recipientEmails),
      rulesetRepo.canonicalName,
      tag,
      errors
    );

    if (this.debugEmail) {
      await this.sendErrorEmailToDevs(
        releaseAuthor,
        rulesetRepo.canonicalName,
        tag,
        errors
      );
    }
  }

  private async sendErrorEmail(
    recipients: string[],
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
        'An unknown error occurred. Please report an issue here: https://github.com/bazel-contrib/publish-to-bcr/issues.';
    }

    console.log(`Sending error email to ${recipients.join(', ')}`);
    console.log(`Subject: ${subject}`);
    console.log(`Content:`);
    console.log(content);

    await this.emailClient.sendEmail(recipients, this.sender, subject, content);
  }

  private async sendErrorEmailToDevs(
    releaseAuthor: User,
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
User ${releaseAuthor.username} <${releaseAuthor.email}> encountered ${unknownErrors.length} unknown error(s) trying publish entry for ${repoCanonicalName}@${tag} to the Bazel Central Registry.

`;
    for (let error of unknownErrors) {
      content += `${error.message}\n${error.stack}\n\n`;
    }

    await this.emailClient.sendEmail(
      [this.debugEmail!],
      this.sender,
      subject,
      content
    );
  }
}
