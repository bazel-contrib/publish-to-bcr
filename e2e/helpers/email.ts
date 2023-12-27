import { ImapFlow } from "imapflow";
import mailparser from "mailparser";
import nodeMailer, { TestAccount } from "nodemailer";

export async function createTestEmailAccount(): Promise<TestAccount> {
  return await nodeMailer.createTestAccount();
}

export async function connectToEmail(
  emailAccount: TestAccount
): Promise<ImapFlow> {
  const client = new ImapFlow({
    host: emailAccount.imap.host,
    port: emailAccount.imap.port,
    secure: true,
    auth: {
      user: emailAccount.user,
      pass: emailAccount.pass,
    },
    logger: false,
  });

  await client.connect();

  return client;
}

export async function fetchEmails(
  emailClient: ImapFlow
): Promise<mailparser.ParsedMail[]> {
  const messages: mailparser.ParsedMail[] = [];
  try {
    await emailClient.mailboxOpen("INBOX", { readOnly: true });

    for await (let message of emailClient.fetch(
      { seq: "1:*", seen: false },
      {
        envelope: true,
        source: true,
      }
    )) {
      messages.push(await mailparser.simpleParser(message.source, {}));
    }
  } finally {
    await emailClient.mailboxClose();
  }

  return messages;
}

export async function deleteAllMail(emailClient: ImapFlow): Promise<void> {
  try {
    await emailClient.messageDelete("1:*");
  } finally {
    await emailClient.mailboxClose();
  }
}
