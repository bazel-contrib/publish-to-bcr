import { Module } from '@nestjs/common';

import { CreateEntryService } from '../../domain/create-entry.js';
import { UserService } from '../../domain/user.js';
import { CreateEntryCommand } from './create-entry-command.js';
import { UNAUTHENTICATED_GITHUB_CLIENT_PROVIDER } from './providers.js';

@Module({
  providers: [
    CreateEntryCommand,
    CreateEntryService,
    UserService,
    UNAUTHENTICATED_GITHUB_CLIENT_PROVIDER,
  ],
})
export class AppModule {}
