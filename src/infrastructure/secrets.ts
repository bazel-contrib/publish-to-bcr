import { Injectable } from "@nestjs/common";

@Injectable()
export class SecretsClient {

  public constructor() {
    
  }

  public async accessSecret(name: string): Promise<string> {
    const secrets: Record<string, string> =  {
      'github-app-private-key': process.env.GITHUB_APP_PRIVATEKEY,
      'github-app-client-id': process.env.GITHUB_APP_CLIENT_ID,
      'github-app-webhook-secret': process.env.GITHUB_APP_WEBHOOK_SECRET,
      'github-app-client-secret': process.env.GITHUB_APP_CLIENT_SECRET,
      'github-bot-app-private-key': process.env.GITHUB_APP_PRIVATEKEY,
      'github-bot-app-client-id': process.env.GITHUB_APP_CLIENT_ID,
      'github-bot-app-client-secret': process.env.GITHUB_APP_CLIENT_SECRET,
    };
    return secrets[name];
  }
}