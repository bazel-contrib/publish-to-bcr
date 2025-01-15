import { Module } from '@nestjs/common';
import { CreateEntryService } from '../../domain/create-entry.js';
import { FindRegistryForkService } from '../../domain/find-registry-fork.js';
import { PublishEntryService } from '../../domain/publish-entry.js';
import { RepositoryService } from '../../domain/repository.js';
import { UserService } from '../../domain/user.js';
import { EmailClient } from '../../infrastructure/email.js';
import { GitClient } from '../../infrastructure/git.js';
import { SecretsClient } from '../../infrastructure/secrets.js';
import { NotificationsService } from '../notifications.js';
import { ReleaseEventHandler } from '../release-event-handler.js';
import {
  APP_OCTOKIT_PROVIDER,
  BCR_APP_OCTOKIT_PROVIDER,
  BCR_GITHUB_CLIENT_PROVIDER,
  RULESET_REPO_GITHUB_CLIENT_PROVIDER,
} from './providers.js';

@Module({
  providers: [
    SecretsClient,
    NotificationsService,
    EmailClient,
    GitClient,
    ReleaseEventHandler,
    CreateEntryService,
    FindRegistryForkService,
    PublishEntryService,
    RepositoryService,
    UserService,
    APP_OCTOKIT_PROVIDER,
    BCR_APP_OCTOKIT_PROVIDER,
    RULESET_REPO_GITHUB_CLIENT_PROVIDER,
    BCR_GITHUB_CLIENT_PROVIDER,
  ],
})
export class AppModule {}
