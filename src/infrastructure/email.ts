import nodemailer from "nodemailer";
import { AuthenticationTypeLogin } from "nodemailer/lib/smtp-connection";

export type Authentication = AuthenticationTypeLogin;

export class EmailClient {
  private auth: Authentication | undefined;

  private readonly host: string;
  private readonly port: number;

  constructor() {
    if (process.env.SMTP_HOST === undefined) {
      throw new Error("Missing SMTP_HOST environment variable.");
    }
    this.host = process.env.SMTP_HOST;

    if (!process.env.SMPT_PORT === undefined) {
      throw new Error("Missing SMTP_PORT environment variable.");
    }
    this.port = Number(process.env.SMTP_PORT);
  }

  public setAuth(auth: Authentication) {
    this.auth = auth;
  }

  public async sendEmail(
    to: string[],
    from: string,
    subject: string,
    text: string,
    html?: string
  ): Promise<void> {
    const transporter = nodemailer.createTransport({
      host: this.host,
      port: this.port,
      secure: true,
      auth: this.auth,
      tls: {
        rejectUnauthorized: false,
      },
    });

    await transporter.sendMail({
      to: to.join(","),
      from,
      subject,
      text,
      html,
    });
  }
}
