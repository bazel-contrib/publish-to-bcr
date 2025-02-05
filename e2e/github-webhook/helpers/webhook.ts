import { sign } from '@octokit/webhooks-methods';
import { ReleasePublishedEvent, User } from '@octokit/webhooks-types';
import axios, { AxiosResponse } from 'axios';
import { randomUUID } from 'crypto';

import type { DeepPartial } from './types';

export async function publishReleaseEvent(
  webhookUrl: string,
  webhookSecret: string,
  installationId: number,
  release: { owner: string; repo: string; tag: string; releaser: Partial<User> }
): Promise<AxiosResponse> {
  const body: DeepPartial<ReleasePublishedEvent> = {
    action: 'published',
    repository: {
      name: release.repo,
      owner: {
        login: release.owner,
      },
    },
    sender: release.releaser,
    release: {
      html_url: `https://github.com/${release.owner}/${release.repo}/releases/tag/${release.tag}`,
      tag_name: release.tag,
    },
    installation: {
      id: installationId,
    },
  };

  const signature = await sign(webhookSecret, JSON.stringify(body));
  const response = await axios.get(webhookUrl, {
    data: body,
    headers: {
      'x-github-delivery': randomUUID(),
      'x-github-event': 'release',
      'x-hub-signature-256': signature,
    },
    validateStatus: () => true, // Always return the status without throwing
  });

  return response;
}
